// Self-check for scripts/updater-lib.mjs: node scripts/updater-check.mjs
import assert from "node:assert/strict";
import { cleanStatus, composeImageLabel, createBody, deriveBrewStatus, orderTargets, parseImageRef, updateDir } from "./updater-lib.mjs";

// --- image references
assert.deepEqual(parseImageRef("ghcr.io/zeapsu/delta:latest"), { repo: "ghcr.io/zeapsu/delta", tag: "latest", digest: null });
assert.deepEqual(parseImageRef("ghcr.io/zeapsu/delta:1.5.0"), { repo: "ghcr.io/zeapsu/delta", tag: "1.5.0", digest: null });
assert.deepEqual(parseImageRef("localhost:5000/delta:latest"), { repo: "localhost:5000/delta", tag: "latest", digest: null });
assert.deepEqual(parseImageRef("localhost:5000/delta"), { repo: "localhost:5000/delta", tag: "latest", digest: null });
assert.deepEqual(parseImageRef("delta"), { repo: "delta", tag: "latest", digest: null });
assert.deepEqual(parseImageRef("ghcr.io/zeapsu/delta@sha256:abc"), { repo: "ghcr.io/zeapsu/delta", tag: null, digest: "sha256:abc" });
assert.deepEqual(parseImageRef("ghcr.io/zeapsu/delta:1.5@sha256:abc"), { repo: "ghcr.io/zeapsu/delta", tag: "1.5", digest: "sha256:abc" });

assert.equal(updateDir({ DATABASE_PATH: "/data/delta.db" }), "/data/update");
assert.equal(updateDir({}), "/data/update");
assert.equal(updateDir({ DATABASE_PATH: "e2e/.tmp/fresh.db" }), "e2e/.tmp/update");

// --- target order
const c = (name, service, mode = "proj_default") => ({ Name: `/${name}`, Config: { Labels: { "com.docker.compose.service": service } }, HostConfig: { NetworkMode: mode } });
const o = orderTargets([c("u", "updater", "none"), c("j", "jobs", "container:abc"), c("d", "delta")]);
assert.deepEqual([o.updater, o.dependents, o.roots].map((a) => a.map((x) => x.Name)), [["/u"], ["/j"], ["/d"]]);

// --- createBody
const OLD_ID = "a".repeat(64);
const oldImage = {
  Env: ["PATH=/usr/bin", "NODE_ENV=production", "DATABASE_PATH=/data/delta.db"],
  Cmd: ["node", "scripts/start.mjs"],
  Entrypoint: ["docker-entrypoint.sh"],
  User: "node",
  WorkingDir: "/app",
  ExposedPorts: { "3000/tcp": {} },
  Volumes: { "/data": {} },
  Labels: { "org.opencontainers.image.version": "1.4.0" },
  StopSignal: "SIGTERM",
};
const delta = {
  Id: OLD_ID,
  Name: "/proj-delta-1",
  Image: "sha256:old",
  Config: {
    ...structuredClone(oldImage),
    Env: [...oldImage.Env, "MY_VAR=keep", "DELTA_URL=http://x"],
    Labels: { ...oldImage.Labels, "my.label": "yes", "com.docker.compose.image": "sha256:old", "com.docker.compose.project": "proj" },
    Hostname: OLD_ID.slice(0, 12),
    Domainname: "",
    Tty: false,
    OpenStdin: false,
    StopTimeout: null,
  },
  HostConfig: { NetworkMode: "proj_default", PortBindings: { "3000/tcp": [{ HostPort: "3000" }] }, Mounts: [{ Type: "volume", Source: "v", Target: "/data" }] },
  NetworkSettings: {
    Networks: {
      proj_default: { Aliases: ["proj-delta-1", "delta", OLD_ID.slice(0, 12)], IPAMConfig: null, Links: null, DriverOpts: null },
      extra: { Aliases: ["x"] },
    },
  },
};
const r = createBody(delta, oldImage, "ghcr.io/zeapsu/delta:latest", "sha256:new");
assert.equal(r.name, "proj-delta-1");
assert.equal(r.body.Image, "ghcr.io/zeapsu/delta:latest");
assert.deepEqual(r.body.Env, ["MY_VAR=keep", "DELTA_URL=http://x"]);
assert.deepEqual(r.body.Labels, { "my.label": "yes", "com.docker.compose.image": "sha256:new", "com.docker.compose.project": "proj" });
for (const k of ["Cmd", "Entrypoint", "User", "WorkingDir", "ExposedPorts", "Volumes", "StopSignal", "Hostname", "Healthcheck"]) assert.ok(!(k in r.body), `${k} follows the new image`);
assert.deepEqual(r.body.HostConfig, delta.HostConfig);
assert.deepEqual(r.body.NetworkingConfig, { EndpointsConfig: { proj_default: { Aliases: ["proj-delta-1", "delta"] } } });
assert.deepEqual(r.extraNetworks, [{ name: "extra", config: { Aliases: ["x"] } }]);

// A command the user (or compose) set differs from the image's: kept.
const jobs = {
  Id: "b".repeat(64),
  Name: "/proj-jobs-1",
  Image: "sha256:old",
  Config: { ...structuredClone(oldImage), Cmd: ["node", "scripts/jobs.mjs"], Hostname: OLD_ID.slice(0, 12), Labels: oldImage.Labels },
  HostConfig: { NetworkMode: `container:${OLD_ID}` },
  NetworkSettings: { Networks: {} },
};
const j = createBody(jobs, oldImage, "img:latest", "sha256:new", { [OLD_ID]: "c".repeat(64) });
assert.deepEqual(j.body.Cmd, ["node", "scripts/jobs.mjs"]);
assert.equal(j.body.HostConfig.NetworkMode, `container:${"c".repeat(64)}`);
assert.ok(!("NetworkingConfig" in j.body) && !("Hostname" in j.body));
assert.equal(jobs.HostConfig.NetworkMode, `container:${OLD_ID}`, "the input is not changed");

// Hostname: a set one is kept on a normal network, never on host/none.
const named = structuredClone(delta);
named.Config.Hostname = "money";
assert.equal(createBody(named, oldImage, "i", "sha256:n").body.Hostname, "money");
assert.deepEqual(createBody(named, oldImage, "i", "sha256:n").body.NetworkingConfig.EndpointsConfig.proj_default.Aliases, ["proj-delta-1", "delta"]);
for (const mode of ["host", "none"]) {
  const x = structuredClone(named);
  x.HostConfig.NetworkMode = mode;
  const b = createBody(x, oldImage, "i", "sha256:n").body;
  assert.ok(!("Hostname" in b) && !("NetworkingConfig" in b), mode);
}

// --- the compose image label: image id, or the platform manifest digest (containerd store)
const mf = (digest, arch = "amd64") => ({ Kind: "image", Available: true, Descriptor: { digest, platform: { os: "linux", architecture: arch } } });
assert.equal(composeImageLabel("sha256:oldid", { Id: "sha256:oldid" }, { Id: "sha256:newid" }), "sha256:newid");
assert.equal(
  composeImageLabel("sha256:m1", { Id: "sha256:idx1", Manifests: [mf("sha256:m1"), mf("sha256:m1arm", "arm64")] }, { Id: "sha256:idx2", Manifests: [mf("sha256:m2arm", "arm64"), mf("sha256:m2")] }),
  "sha256:m2",
);
assert.equal(composeImageLabel("sha256:m1", { Id: "x" }, { Id: "sha256:idx2" }), "sha256:idx2");

// --- status.json is reduced to what the app may read
assert.deepEqual(cleanStatus({ state: "pulling", at: 5, requestedAt: 4, message: "m", extra: 1 }), { state: "pulling", at: 5, requestedAt: 4, message: "m" });
assert.deepEqual(cleanStatus({ state: "nope", at: "x" }), { state: "idle", at: 0 });
assert.deepEqual(cleanStatus(null), { state: "idle", at: 0 });

// --- Homebrew: done is derived
const T = 1_000_000_000;
assert.equal(deriveBrewStatus({ state: "restarting", at: T, from: "v1" }, "v1", T).state, "restarting");
assert.equal(deriveBrewStatus({ state: "restarting", at: T, from: "v1" }, "v2", T).state, "done");
assert.equal(deriveBrewStatus({ state: "pulling", at: T, requestedAt: T }, "v1", T + 29 * 60_000).state, "pulling");
assert.equal(deriveBrewStatus({ state: "pulling", at: T, requestedAt: T }, "v1", T + 31 * 60_000).state, "failed");
assert.equal(deriveBrewStatus({ state: "failed", at: T }, "v2", T + 99 * 60_000).state, "failed");

console.log("updater-check: ok");
