// Sync-before-read for agents (POST /api/v1/sync, the MCP `sync` tool and
// every MCP read tool). Pure policy with its effects passed in, no DB or Plaid
// imports; self-check: lib/fresh-sync-check.ts. The route wires it to
// lib/sync.ts.
//
// A sync only pulls what Plaid already has. Balances are live, but Plaid
// checks banks for new transactions only 1-4x a day unless asked with
// /transactions/refresh, which is async. So:
// - a read finds data older than FRESH_FOR_MS: sync now (joining a run in
//   progress), but answer after READ_WAIT_MS at most, so a slow bank never
//   hangs a tool call; also ask for a refresh, at most every
//   AUTO_REFRESH_EVERY_MS, and sync again `followUpMs` later to pick it up.
// - an explicit sync: refresh + sync + follow-up, unless a refresh started
//   less than SYNC_TOOL_EVERY_MS ago (the sync timer's counts too).
// Refresh is free on Plaid's Trial plan and billed per call on paid plans;
// these limits are what bound it.

export const FRESH_FOR_MS = 15 * 60_000;
export const AUTO_REFRESH_EVERY_MS = 60 * 60_000;
export const SYNC_TOOL_EVERY_MS = 5 * 60_000;
export const READ_WAIT_MS = 10_000;
export const SYNC_TOOL_WAIT_MS = 30_000;

type Counts = { added: number; modified: number; removed: number; errors: unknown[] };

export type FreshSyncDeps = {
  now(): number;
  // Newest of: this process's last full run, the oldest connection's
  // last_synced_at. null = never, or no connections.
  lastSync(): number | null;
  lastRefresh(): number | null;
  hasItems(): boolean;
  syncAll(): Promise<Counts>;
  refreshAll(): Promise<unknown>;
  later(ms: number, fn: () => void): void;
  followUpMs: number;
};

export type SyncOutcome = {
  // fresh: nothing to do; synced: a sync finished for this call; running: a
  // sync started (or was already running) but this call didn't wait for it;
  // throttled: an explicit sync asked too soon after the last refresh;
  // no_connections: no bank is linked.
  status: "fresh" | "synced" | "running" | "throttled" | "no_connections";
  // Set when status is synced: what the sync changed and which connections failed.
  result?: Counts;
  // When transactions from a refresh should be in: the follow-up sync's time.
  next_sync_at: string | null;
};

export function createFreshSync(deps: FreshSyncDeps) {
  let followUpAt: number | null = null;

  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

  function refresh() {
    deps.refreshAll().catch(() => {});
    if (followUpAt !== null) return;
    followUpAt = deps.now() + deps.followUpMs;
    deps.later(deps.followUpMs, () => {
      followUpAt = null;
      deps.syncAll().catch(() => {});
    });
  }

  async function run(waitMs: number, refreshEveryMs: number): Promise<SyncOutcome> {
    const last = deps.lastRefresh();
    if (last === null || deps.now() - last >= refreshEveryMs) refresh();
    const sync = deps.syncAll();
    sync.catch(() => {}); // still running in the background after a timeout
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      sync,
      new Promise<null>((r) => {
        timer = setTimeout(() => r(null), waitMs);
      }),
    ]).finally(() => clearTimeout(timer));
    return result
      ? { status: "synced", result, next_sync_at: iso(followUpAt) }
      : { status: "running", next_sync_at: iso(followUpAt) };
  }

  return {
    // For reads: sync only when the data is stale.
    ifStale(): Promise<SyncOutcome> {
      if (!deps.hasItems()) return Promise.resolve({ status: "no_connections", next_sync_at: null });
      const last = deps.lastSync();
      if (last !== null && deps.now() - last < FRESH_FOR_MS) {
        return Promise.resolve({ status: "fresh", next_sync_at: iso(followUpAt) });
      }
      return run(READ_WAIT_MS, AUTO_REFRESH_EVERY_MS);
    },
    // For "check my bank now".
    now(): Promise<SyncOutcome> {
      if (!deps.hasItems()) return Promise.resolve({ status: "no_connections", next_sync_at: null });
      const last = deps.lastRefresh();
      if (last !== null && deps.now() - last < SYNC_TOOL_EVERY_MS) {
        return Promise.resolve({ status: "throttled", next_sync_at: iso(followUpAt) });
      }
      return run(SYNC_TOOL_WAIT_MS, 0);
    },
  };
}
