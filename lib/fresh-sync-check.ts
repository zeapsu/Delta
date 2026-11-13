import assert from "node:assert";
import { AUTO_REFRESH_EVERY_MS, createFreshSync, FRESH_FOR_MS, SYNC_TOOL_EVERY_MS, type FreshSyncDeps } from "./fresh-sync";

// A fake clock and Plaid: counts syncs and refreshes, holds the follow-up timer.
function setup(over: Partial<FreshSyncDeps> = {}) {
  const s = {
    t: 1_000_000_000,
    lastSync: null as number | null,
    lastRefresh: null as number | null,
    syncs: 0,
    refreshes: 0,
    timers: [] as { ms: number; fn: () => void }[],
  };
  const deps: FreshSyncDeps = {
    now: () => s.t,
    lastSync: () => s.lastSync,
    lastRefresh: () => s.lastRefresh,
    hasItems: () => true,
    syncAll: async () => {
      s.syncs++;
      s.lastSync = s.t;
      return { added: 2, modified: 0, removed: 0, errors: [] };
    },
    refreshAll: async () => {
      s.refreshes++;
      s.lastRefresh = s.t;
    },
    later: (ms, fn) => s.timers.push({ ms, fn }),
    followUpMs: 180_000,
    ...over,
  };
  return { s, fresh: createFreshSync(deps) };
}

async function main() {
  // Never synced: a read syncs, refreshes and schedules one follow-up sync.
  let { s, fresh } = setup();
  let r = await fresh.ifStale();
  assert.strictEqual(r.status, "synced");
  assert.deepStrictEqual(r.result, { added: 2, modified: 0, removed: 0, errors: [] });
  assert.strictEqual(s.syncs, 1);
  assert.strictEqual(s.refreshes, 1);
  assert.strictEqual(s.timers.length, 1);
  assert.strictEqual(r.next_sync_at, new Date(s.t + 180_000).toISOString());

  // Within 15 minutes: nothing happens, the pending follow-up is still reported.
  s.t += FRESH_FOR_MS - 1;
  r = await fresh.ifStale();
  assert.strictEqual(r.status, "fresh");
  assert.strictEqual(s.syncs, 1);
  assert(r.next_sync_at);

  // The follow-up runs once and clears.
  s.timers.shift()!.fn();
  assert.strictEqual(s.syncs, 2);
  assert.strictEqual((await fresh.ifStale()).next_sync_at, null);

  // Stale again but refreshed less than an hour ago: sync without a refresh.
  s.t += FRESH_FOR_MS;
  r = await fresh.ifStale();
  assert.strictEqual(r.status, "synced");
  assert.strictEqual(s.refreshes, 1);
  assert.strictEqual(s.timers.length, 0);
  // An hour after the refresh, a stale read refreshes again.
  s.lastRefresh = s.t - AUTO_REFRESH_EVERY_MS;
  s.lastSync = s.t - FRESH_FOR_MS;
  await fresh.ifStale();
  assert.strictEqual(s.refreshes, 2);

  // Explicit sync: throttled within 5 minutes of any refresh, otherwise refresh + sync.
  ({ s, fresh } = setup());
  s.lastSync = s.t; // fresh data doesn't stop an explicit sync
  s.lastRefresh = s.t - SYNC_TOOL_EVERY_MS + 1;
  r = await fresh.now();
  assert.strictEqual(r.status, "throttled");
  assert.strictEqual(s.syncs, 0);
  s.t += 1;
  r = await fresh.now();
  assert.strictEqual(r.status, "synced");
  assert.strictEqual(s.refreshes, 1);
  assert.strictEqual(s.syncs, 1);
  // A second refresh while a follow-up is pending doesn't stack another timer.
  s.t += SYNC_TOOL_EVERY_MS;
  await fresh.now();
  assert.strictEqual(s.refreshes, 2);
  assert.strictEqual(s.timers.length, 1);

  // No connections: no Plaid calls at all.
  ({ s, fresh } = setup({ hasItems: () => false }));
  assert.strictEqual((await fresh.ifStale()).status, "no_connections");
  assert.strictEqual((await fresh.now()).status, "no_connections");
  assert.strictEqual(s.syncs + s.refreshes, 0);

  // A slow sync doesn't hold the read: "running" after the wait, sync continues.
  let finish!: () => void;
  ({ s, fresh } = setup({
    syncAll: () => new Promise((res) => (finish = () => res({ added: 0, modified: 0, removed: 0, errors: [] }))),
  }));
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout; // skip the 10 s wait
  try {
    r = await fresh.ifStale();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.strictEqual(r.status, "running");
  finish();

  // A failing refresh is swallowed; a failing sync rejects (the route answers
  // 500, and MCP reads go on with the saved data).
  ({ s, fresh } = setup({
    refreshAll: () => Promise.reject(new Error("plaid down")),
    syncAll: () => Promise.reject(new Error("plaid down")),
  }));
  await assert.rejects(fresh.ifStale(), /plaid down/);
  s.timers.shift()!.fn(); // the follow-up swallows its own failure

  console.log("fresh-sync-check: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
