import { sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { readRoute } from "@/lib/api-params";

export const dynamic = "force-dynamic";

// Freshness check (skill query 1) plus each connection's last sync result.
export const GET = readRoute(async () => {
  const [[fresh], connections] = await Promise.all([
    db.all<{ lastTransaction: string | null; lastSnapshot: string | null; lastInvestment: string | null }>(sql`
      SELECT (SELECT MAX(date) FROM transactions) AS lastTransaction,
             (SELECT date(MAX(snapshot_at) / 1000, 'unixepoch', 'localtime') FROM balance_snapshots) AS lastSnapshot,
             (SELECT MAX(date) FROM investment_transactions) AS lastInvestment
    `),
    // Never select access_token or the sync cursor.
    db
      .select({
        id: items.id,
        institution: items.institutionName,
        lastSyncedAt: items.lastSyncedAt,
        lastErrorCode: items.lastErrorCode,
      })
      .from(items),
  ]);
  return { ...fresh, connections };
});
