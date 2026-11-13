import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createFreshSync } from "@/lib/fresh-sync";
import { refreshAll, safePlaidError, syncAll, syncClock } from "@/lib/sync";

export const dynamic = "force-dynamic";

// The sync timer's wait between refresh and sync, reused for the follow-up
// sync after a refresh started here. Junk or negative falls back to 180 s.
const wait = Number(process.env.REFRESH_WAIT_SECONDS?.trim() || 180);
const followUpMs = (Number.isFinite(wait) && wait >= 0 ? Math.min(wait, 86_400) : 180) * 1000;

const fresh = createFreshSync({
  now: Date.now,
  lastSync() {
    const row = db.get<{ n: number; never: number; oldest: number | null }>(sql`
      SELECT COUNT(*) AS n, SUM(last_synced_at IS NULL) AS never, MIN(last_synced_at) AS oldest FROM items
    `);
    const oldest = row.n > 0 && !row.never ? row.oldest : null;
    const run = syncClock().lastFullRunAt;
    return oldest === null ? run : run === null ? oldest : Math.max(oldest, run);
  },
  lastRefresh: () => syncClock().lastRefreshAt,
  hasItems: () => db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM items`).n > 0,
  syncAll,
  refreshAll,
  later: (ms, fn) => setTimeout(fn, ms).unref(),
  followUpMs,
});

// Agents' sync (read scope, see lib/api-auth.ts). Body {"if_stale": true}
// syncs only when the data is older than 15 minutes (the MCP read tools send
// it); without it, asks Plaid to re-check the banks and syncs now, at most
// once every 5 minutes. Never waits on Plaid for long: a sync still running
// comes back as status "running". Plaid errors are caught (never a raw
// AxiosError, whose config holds the secret and access token).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ifStale = body?.if_stale;
  if (ifStale !== undefined && typeof ifStale !== "boolean") {
    return NextResponse.json({ error: "if_stale must be a boolean" }, { status: 400 });
  }
  try {
    return NextResponse.json(await (ifStale ? fresh.ifStale() : fresh.now()));
  } catch (err) {
    const { error_code } = safePlaidError(err);
    console.error(`agent sync failed: error_code=${error_code}`);
    return NextResponse.json({ error: "sync failed", error_code }, { status: 500 });
  }
}
