// Updates Delta from its header's Update pill (docs/updating.md, "Update from
// the app"). Plain node, no dependencies, like scripts/jobs.mjs. It runs as
// the opt-in `updater` compose service: same image, root (the Docker socket is
// root's), no network and no port. The only input it takes is that a file
// named `request` appears in <data dir>/update/, and the only things it does
// are pulling the image its own container already uses and recreating the
// containers of its own compose project that use that same image reference.
//
//   node scripts/updater.mjs         long-running: poll for a request, pull, start the worker
//   node scripts/updater.mjs apply   the worker: swap the containers, roll back if the new ones fail
//
// The worker is a one-shot container from the NEW image, so the swap is done
// by a process that is not one of the containers being replaced. Progress goes
// to update/status.json, which the app reads (lib/updater.ts); anything that
// goes wrong is logged here in full and shown there as a short fixed message.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { composeImageLabel, createBody, orderTargets, parseImageRef, IMAGE_LABEL, PROJECT_LABEL, shortId, updateDir } from "./updater-lib.mjs";
import { ensureDir as ensureDirOf, readStatus as readStatusFile, writeStatus as writeStatusFile } from "./updater-status.mjs";

const SOCKET = "/var/run/docker.sock";
const DIR = updateDir();
const REQUEST = path.join(DIR, "request");
const POLL_MS = 2000;
const HEARTBEAT_MS = 20_000;
const STALE_MS = 10 * 60_000;
const WORKER_LABEL = "delta.update-worker";

const log = (...a) => console.log(new Date().toISOString(), "updater:", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Docker Engine API over the unix socket ---

// { status, json, text }. Unversioned paths: the daemon's newest API.
function docker(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {};
    const req = http.request({ socketPath: SOCKET, method, path: url, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({ status: res.statusCode ?? 0, json, text });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// Names and references go into URL paths: encode them, keep the separators.
const enc = (s) => encodeURIComponent(s).replace(/%2F/gi, "/").replace(/%3A/gi, ":");
const q = (params) => new URLSearchParams(params).toString();

// Throws (with the daemon's message, for the log only) unless the status is one of `ok`.
async function ok(promise, what, okStatuses = [200, 201, 204]) {
  const res = await promise;
  if (!okStatuses.includes(res.status)) throw new Error(`${what}: ${res.status} ${(res.json?.message ?? res.text).slice(0, 300)}`);
  return res;
}

const inspect = async (id) => (await ok(docker("GET", `/containers/${enc(id)}/json`), `inspect ${id}`)).json;

// Containers of `project` created from exactly `ref` (an image reference as
// written in the compose file, so a retagged image doesn't hide them).
async function projectContainers(project, ref) {
  const filters = JSON.stringify({ label: [`${PROJECT_LABEL}=${project}`] });
  const list = (await ok(docker("GET", `/containers/json?${q({ all: "1", filters })}`), "list containers")).json ?? [];
  const found = [];
  for (const c of list) {
    const i = await inspect(c.Id);
    if (i.Config?.Image === ref) found.push(i);
  }
  return found;
}

// --- status file, the only way the app hears from us ---

const readStatus = () => readStatusFile(DIR);
const writeStatus = (state, extra) => writeStatusFile(DIR, state, extra);

// --- the long-running updater ---

async function findSelf() {
  try {
    const self = await inspect(os.hostname());
    const project = self.Config?.Labels?.[PROJECT_LABEL];
    if (!project || !self.Config?.Image) throw new Error("the container has no compose project label or image");
    return { self, project, ref: self.Config.Image };
  } catch (err) {
    log("can't find my own container:", err.message);
    return null;
  }
}

async function pull(ref) {
  const { repo, tag, digest } = parseImageRef(ref);
  const res = await docker("POST", `/images/create?${q({ fromImage: repo, tag: tag ?? "" })}`);
  if (res.status !== 200) throw new Error(`pull ${ref}: ${res.status} ${res.text.slice(0, 300)}`);
  // A stream of JSON lines that ends 200 even when the pull failed midway.
  for (const line of res.text.split("\n")) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.error) throw new Error(`pull ${ref}: ${String(msg.error).slice(0, 300)}`);
  }
  return digest;
}

async function runUpdate({ self, project, ref }, requestedAt) {
  const { tag, digest } = parseImageRef(ref);
  if (digest) {
    writeStatus("current", { requestedAt, message: "Pinned to a fixed image: change DELTA_TAG to update." });
    return;
  }
  writeStatus("pulling", { requestedAt, message: undefined, from: undefined, to: undefined });
  try {
    await pull(ref);
  } catch (err) {
    log(err.message);
    writeStatus("failed", { message: "Couldn't download the new version." });
    return;
  }
  const image = (await ok(docker("GET", `/images/${enc(ref)}/json`), `inspect image ${ref}`)).json;
  const targets = await projectContainers(project, ref);
  if (targets.every((t) => t.Image === image.Id)) {
    writeStatus("current", {
      message: tag === "latest" ? "Already on the newest image." : `Pinned to ${tag}: change DELTA_TAG to update.`,
    });
    return;
  }

  // The swap is done by a container that is not one of those being replaced.
  const name = `${project}-update-worker`;
  await docker("DELETE", `/containers/${enc(name)}?${q({ force: "1" })}`);
  const host = { NetworkMode: "none", AutoRemove: true, ReadonlyRootfs: true, SecurityOpt: ["no-new-privileges:true"] };
  if (self.HostConfig?.Binds?.length) host.Binds = self.HostConfig.Binds;
  if (self.HostConfig?.Mounts?.length) host.Mounts = self.HostConfig.Mounts;
  const created = await ok(
    docker("POST", `/containers/create?${q({ name })}`, {
      Image: ref,
      Cmd: ["node", "scripts/updater.mjs", "apply"],
      User: "0:0",
      Env: [`DELTA_UPDATE_PROJECT=${project}`, `DELTA_UPDATE_IMAGE=${ref}`, `DATABASE_PATH=${envOf(self, "DATABASE_PATH") ?? ""}`].filter(
        (e) => !e.endsWith("="),
      ),
      Labels: { [WORKER_LABEL]: "1" },
      HostConfig: host,
    }),
    "create worker",
  );
  writeStatus("restarting", { message: undefined });
  try {
    await ok(docker("POST", `/containers/${created.json.Id}/start`), "start worker", [204, 304]);
  } catch (err) {
    await docker("DELETE", `/containers/${created.json.Id}?${q({ force: "1" })}`);
    throw err;
  }
  log(`worker ${shortId(created.json.Id)} started`);
}

const envOf = (c, key) => c.Config?.Env?.find((e) => e.startsWith(`${key}=`))?.slice(key.length + 1);

async function serve() {
  // Node as a container's first process ignores SIGTERM unless told not to.
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0));
  ensureDirOf(DIR);
  // A request left from before a restart belongs to a world that is gone.
  fs.rmSync(REQUEST, { force: true, recursive: true });
  const status = readStatus();
  const age = Date.now() - (status?.requestedAt ?? status?.at ?? 0);
  if (!status) writeStatus("idle");
  else if (status.state === "restarting" && age > STALE_MS) {
    writeStatus("failed", { message: "The update was interrupted." });
  }
  // Otherwise keep what's there: a recent `restarting` belongs to the worker,
  // done/failed/current stay for the app to read, and the first heartbeat
  // ends a `pulling` that a restart cut short.

  let me = await findSelf();
  let busy = false;
  const heartbeat = () => {
    const s = readStatus();
    if (!me) return writeStatus("failed", { message: "Updater can't find its own container." });
    if (!s) return writeStatus("idle");
    // `restarting` is the worker's to change, and it may write its final word
    // at any moment: leave it alone (the app counts a running update as an
    // updater being there). If the worker died, don't sit in it forever.
    if (s.state === "restarting") {
      if (Date.now() - (s.requestedAt ?? s.at) > STALE_MS) writeStatus("failed", { message: "The update was interrupted." });
      return;
    }
    // `pulling` is this process's own: one it isn't doing was cut short by a restart.
    if (s.state === "pulling") {
      if (!busy) writeStatus("failed", { message: "The update was interrupted." });
      return;
    }
    // Same state, fresh timestamp.
    writeStatus(s.state, { message: s.message, from: s.from, to: s.to });
  };
  setInterval(() => {
    try {
      heartbeat();
    } catch (err) {
      log("heartbeat:", err.message);
    }
  }, HEARTBEAT_MS);
  heartbeat();
  log(me ? `ready (project ${me.project}, image ${me.ref})` : "not ready: see above");

  for (;;) {
    await sleep(POLL_MS);
    try {
      if (!fs.existsSync(REQUEST) && !isLink(REQUEST)) continue;
      fs.rmSync(REQUEST, { force: true, recursive: true });
      const s = readStatus();
      if (s?.state === "restarting" && Date.now() - s.at < STALE_MS) {
        log("request ignored: an update is running");
        continue;
      }
      me ??= await findSelf();
      const requestedAt = Date.now();
      if (!me) {
        writeStatus("failed", { requestedAt, message: "Updater can't find its own container." });
        continue;
      }
      busy = true;
      try {
        await runUpdate(me, requestedAt);
      } catch (err) {
        log("update failed:", err.message);
        writeStatus("failed", { message: "The update couldn't start." });
      } finally {
        busy = false;
      }
    } catch (err) {
      log("poll:", err.message);
    }
  }
}

const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

// --- the worker ---

const FAILED_ROLLED_BACK = "The new version didn't start. Delta is back on the previous one.";

async function removeContainer(id) {
  await docker("DELETE", `/containers/${enc(id)}?${q({ force: "1" })}`).catch(() => {});
}

// Stop, rename aside, create from the new image, connect extra networks, start.
async function createAndStart(plan) {
  const res = await ok(docker("POST", `/containers/create?${q({ name: plan.name })}`, plan.body), `create ${plan.name}`);
  const id = res.json.Id;
  plan.newId = id;
  for (const n of plan.extraNetworks) {
    await ok(docker("POST", `/networks/${enc(n.name)}/connect`, { Container: id, EndpointConfig: n.config }), `connect ${plan.name} to ${n.name}`);
  }
  await ok(docker("POST", `/containers/${id}/start`), `start ${plan.name}`, [204, 304]);
  return id;
}

async function stopAside(c) {
  const aside = `${c.Name.replace(/^\//, "")}-old-update`;
  await ok(docker("POST", `/containers/${c.Id}/stop?${q({ t: "30" })}`), `stop ${c.Name}`, [204, 304]);
  await removeContainer(aside);
  await ok(docker("POST", `/containers/${c.Id}/rename?${q({ name: aside })}`), `rename ${c.Name}`, [204]);
}

// Verify for 20 s that every new container stays up and doesn't restart.
async function verify(ids) {
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    for (const id of ids) {
      const c = await inspect(id);
      const s = c.State ?? {};
      if (!s.Running || s.Restarting || c.RestartCount !== 0) {
        throw new Error(`${id} is not staying up (running=${s.Running} restarting=${s.Restarting} restarts=${c.RestartCount})`);
      }
    }
  }
}

async function apply() {
  const project = process.env.DELTA_UPDATE_PROJECT;
  const ref = process.env.DELTA_UPDATE_IMAGE;
  if (!project || !ref) throw new Error("DELTA_UPDATE_PROJECT and DELTA_UPDATE_IMAGE are required");
  const image = (await ok(docker("GET", `/images/${enc(ref)}/json?manifests=1`), `inspect image ${ref}`)).json;
  const me = os.hostname();
  const all = (await projectContainers(project, ref)).filter((c) => !c.Id.startsWith(me));
  const stale = all.filter((c) => c.Image !== image.Id);
  let { updater, dependents, roots } = orderTargets(stale);
  // A root that is replaced takes its dependents' network with it.
  if (roots.length) dependents = orderTargets(all).dependents;
  const swap = [...dependents, ...roots];
  const from = shortId((roots[0] ?? dependents[0] ?? updater[0])?.Image);

  // Everything is inspected and every body built before anything is touched.
  const oldImages = new Map();
  for (const c of [...swap, ...updater]) {
    if (!oldImages.has(c.Image)) {
      const r = await docker("GET", `/images/${enc(c.Image)}/json?manifests=1`);
      oldImages.set(c.Image, r.status === 200 ? r.json : {});
    }
  }
  const plan = (c, idMap = {}) => {
    const old = oldImages.get(c.Image);
    const label = composeImageLabel(c.Config?.Labels?.[IMAGE_LABEL], old, image);
    return { old: c, ...createBody(c, old.Config, ref, label, idMap) };
  };
  const rootPlans = roots.map((c) => plan(c));
  for (const c of dependents) plan(c);
  const updaterPlans = updater.map((c) => plan(c));

  const started = [];
  const stoppedOld = [];
  try {
    for (const c of swap) {
      stoppedOld.push(c); // before, not after: one that stopped but wasn't renamed is started again too
      await stopAside(c);
    }
    const idMap = {};
    for (const p of rootPlans) {
      started.push(p);
      idMap[p.old.Id] = await createAndStart(p);
    }
    for (const c of dependents) {
      const p = plan(c, idMap);
      started.push(p);
      await createAndStart(p);
    }
    await verify(started.map((p) => p.newId));
  } catch (err) {
    // A start that failed may already have migrated the database: the version
    // before it is back, but its data may not be. The pre-update backup is
    // the way back (docs/updating.md#roll-back).
    log("update failed, rolling back:", err.message);
    for (const p of [...started].reverse()) if (p.newId) await removeContainer(p.newId);
    // Roots first: dependents share their network.
    for (const c of [...stoppedOld].sort((a, b) => Number(dependents.includes(a)) - Number(dependents.includes(b)))) {
      await docker("POST", `/containers/${c.Id}/rename?${q({ name: c.Name.replace(/^\//, "") })}`).catch(() => {});
    }
    for (const c of [...stoppedOld].sort((a, b) => Number(dependents.includes(a)) - Number(dependents.includes(b)))) {
      await docker("POST", `/containers/${c.Id}/start`).catch(() => {});
    }
    writeStatus("failed", { message: FAILED_ROLLED_BACK });
    return;
  }
  for (const c of swap) await removeContainer(c.Id);
  log("app containers updated");

  // The updater replaces itself last. If that fails the app update still stands.
  for (const p of updaterPlans) {
    try {
      await stopAside(p.old);
      await createAndStart(p);
      await sleep(3000);
      const s = (await inspect(p.newId)).State ?? {};
      if (!s.Running || s.Restarting) throw new Error("the new updater isn't running");
      await removeContainer(p.old.Id);
    } catch (err) {
      log("updater replacement failed, keeping the old one:", err.message);
      if (p.newId) await removeContainer(p.newId);
      await docker("POST", `/containers/${p.old.Id}/rename?${q({ name: p.old.Name.replace(/^\//, "") })}`).catch(() => {});
      await docker("POST", `/containers/${p.old.Id}/start`).catch(() => {});
    }
  }

  // Images the update replaced, unless something else still tags them.
  for (const id of oldImages.keys()) {
    if (id === image.Id) continue;
    const r = await docker("GET", `/images/${enc(id)}/json`).catch(() => null);
    if (r?.status === 200 && !(r.json.RepoTags ?? []).length) await docker("DELETE", `/images/${enc(id)}`).catch(() => {});
  }
  writeStatus("done", { message: "Updated to the newest version.", from, to: shortId(image.Id) });
  log(`done: ${from} -> ${shortId(image.Id)}`);
}

if (process.argv[2] === "apply") {
  apply().catch((err) => {
    log("worker failed:", err.message);
    try {
      writeStatus("failed", { message: "The update failed. Check docker compose ps." });
    } catch {}
    process.exitCode = 1;
  });
} else {
  serve().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
