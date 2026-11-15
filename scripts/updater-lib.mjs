// Pure helpers for scripts/updater.mjs (self-check: scripts/updater-check.mjs).
// No I/O here: image references, which containers an update replaces, and the
// body that re-creates a container on a new image.
import path from "node:path";

export const STATES = ["idle", "pulling", "restarting", "done", "current", "failed"];
export const PROJECT_LABEL = "com.docker.compose.project";
export const SERVICE_LABEL = "com.docker.compose.service";
export const IMAGE_LABEL = "com.docker.compose.image";

// <dirname(DATABASE_PATH)>/update: where the app and the updater meet.
export function updateDir(env = process.env) {
  return path.join(path.dirname(env.DATABASE_PATH ?? "/data/delta.db"), "update");
}

// "ghcr.io/zeapsu/delta:latest" -> { repo, tag, digest }. A colon only starts a
// tag after the last slash ("localhost:5000/delta" has none); no tag means
// latest; "repo@sha256:..." is pinned to a digest.
export function parseImageRef(ref) {
  let rest = String(ref);
  let digest = null;
  const at = rest.indexOf("@");
  if (at >= 0) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  const colon = rest.lastIndexOf(":");
  let tag = null;
  if (colon > rest.lastIndexOf("/")) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
  }
  return { repo: rest, tag: tag ?? (digest ? null : "latest"), digest };
}

// Split what an update replaces, in the order it has to be stopped and
// started: roots (the web app), then dependents (share a root's network
// namespace via container:<id>), with the updater itself last and apart.
export function orderTargets(inspects) {
  const updater = [];
  const dependents = [];
  const roots = [];
  for (const c of inspects) {
    if (c.Config?.Labels?.[SERVICE_LABEL] === "updater") updater.push(c);
    else if (String(c.HostConfig?.NetworkMode ?? "").startsWith("container:")) dependents.push(c);
    else roots.push(c);
  }
  return { updater, dependents, roots };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
const KEYLESS_NETWORKS = (mode) => mode === "host" || mode === "none" || String(mode).startsWith("container:");

// The body of POST /containers/create for `inspect`'s container on the new
// image. A container's Config mirrors its image's defaults at creation time,
// so whatever merely equals the OLD image's value is dropped and the new image
// supplies its own; whatever differs (compose's command, the user's env and
// labels) is kept. idMap maps old container ids to new ones for
// NetworkMode "container:<id>". Returns { name, body, extraNetworks }.
export function createBody(inspect, oldImageConfig, newImageRef, newImageId, idMap = {}) {
  const c = inspect.Config ?? {};
  const old = oldImageConfig ?? {};
  const mode = String(inspect.HostConfig?.NetworkMode ?? "");
  const body = { Image: newImageRef };

  const oldEnv = new Set(old.Env ?? []);
  const env = (c.Env ?? []).filter((e) => !oldEnv.has(e));
  if (env.length) body.Env = env;

  const labels = {};
  for (const [k, v] of Object.entries(c.Labels ?? {})) {
    if ((old.Labels ?? {})[k] !== v) labels[k] = v;
  }
  if (IMAGE_LABEL in labels) labels[IMAGE_LABEL] = newImageId;
  if (Object.keys(labels).length) body.Labels = labels;

  for (const k of ["Cmd", "Entrypoint", "WorkingDir", "User", "Healthcheck", "StopSignal", "ExposedPorts", "Volumes"]) {
    if (!isEmpty(c[k]) && !same(c[k], old[k])) body[k] = c[k];
  }
  for (const k of ["StopTimeout"]) if (c[k] != null) body[k] = c[k];
  for (const k of ["Tty", "OpenStdin"]) if (c[k]) body[k] = true;

  // The default hostname is the first 12 characters of the old id, which the
  // new container must not inherit. Joined or absent network stacks reject one.
  const defaultHost = String(inspect.Id ?? "").slice(0, 12);
  if (c.Hostname && c.Hostname !== defaultHost && !KEYLESS_NETWORKS(mode)) body.Hostname = c.Hostname;
  if (c.Domainname && !KEYLESS_NETWORKS(mode)) body.Domainname = c.Domainname;

  const host = { ...(inspect.HostConfig ?? {}) };
  if (mode.startsWith("container:")) {
    const was = mode.slice("container:".length);
    const now = idMap[was] ?? Object.entries(idMap).find(([k]) => k.startsWith(was) || was.startsWith(k))?.[1];
    if (now) host.NetworkMode = `container:${now}`;
  }
  body.HostConfig = host;

  const extraNetworks = [];
  if (!KEYLESS_NETWORKS(mode)) {
    const nets = Object.entries(inspect.NetworkSettings?.Networks ?? {});
    // The network the container was created on, else the first.
    const first = nets.find(([n]) => n === mode) ?? nets[0];
    const drop = new Set([defaultHost, c.Hostname].filter(Boolean));
    const endpoint = (e) => {
      const out = {};
      const aliases = (e.Aliases ?? []).filter((a) => !drop.has(a));
      if (aliases.length) out.Aliases = aliases;
      for (const k of ["IPAMConfig", "Links", "DriverOpts"]) if (e[k] != null) out[k] = e[k];
      return out;
    };
    if (first) body.NetworkingConfig = { EndpointsConfig: { [first[0]]: endpoint(first[1]) } };
    for (const [n, e] of nets) if (n !== first?.[0]) extraNetworks.push({ name: n, config: endpoint(e) });
  }

  return { name: String(inspect.Name ?? "").replace(/^\//, ""), body, extraNetworks };
}

// What compose records in the `com.docker.compose.image` label (and compares
// on the next `up`): the image id, or with Docker's containerd image store the
// digest of the platform manifest, which is not the id when the image is an
// index. Work out which the old container used, and give the new image's
// equivalent. Images are `GET /images/<ref>/json?manifests=1` results.
export function composeImageLabel(oldLabel, oldImage, newImage) {
  if (!oldLabel || oldLabel === oldImage?.Id) return newImage.Id;
  const images = (img) => (img?.Manifests ?? []).filter((m) => m.Kind === "image" && m.Available !== false);
  const old = images(oldImage).find((m) => m.Descriptor?.digest === oldLabel);
  const platform = (m) => JSON.stringify([m?.Descriptor?.platform?.os, m?.Descriptor?.platform?.architecture, m?.Descriptor?.platform?.variant]);
  const now = images(newImage).find((m) => old && platform(m) === platform(old)) ?? images(newImage)[0];
  return now?.Descriptor?.digest ?? newImage.Id;
}

// Keep only what the app may read from status.json, whoever wrote the file.
export function cleanStatus(raw) {
  const out = { state: "idle", at: 0 };
  if (!raw || typeof raw !== "object") return out;
  if (STATES.includes(raw.state)) out.state = raw.state;
  if (Number.isFinite(raw.at)) out.at = raw.at;
  if (Number.isFinite(raw.requestedAt)) out.requestedAt = raw.requestedAt;
  for (const k of ["message", "from", "to"]) if (typeof raw[k] === "string") out[k] = raw[k].slice(0, 200);
  return out;
}

export const shortId = (id) => String(id ?? "").replace(/^sha256:/, "").slice(0, 12);

// Homebrew installs have no worker to write `done`: the new build answering is
// the proof. An update started by a build other than the running one means
// the restart happened. A state nobody has finished for 30 minutes was interrupted.
export const BREW_STALE_MS = 30 * 60_000;
export function deriveBrewStatus(status, commit, now = Date.now()) {
  const s = { ...status };
  if ((s.state === "pulling" || s.state === "restarting") && s.from && commit && s.from !== commit) {
    return { ...s, state: "done", message: "Updated to the newest version." };
  }
  if ((s.state === "pulling" || s.state === "restarting") && now - (s.requestedAt ?? s.at) > BREW_STALE_MS) {
    return { ...s, state: "failed", message: "The update was interrupted." };
  }
  return s;
}
