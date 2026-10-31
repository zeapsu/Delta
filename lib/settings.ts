import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { withDefaults, type AnalysisSettings } from "@/lib/analysis";

// customized = the user saved their own (or kept the defaults on purpose);
// false means setup hasn't happened and the defaults apply.
export async function getAnalysisSettings(): Promise<{ analysis: AnalysisSettings; customized: boolean }> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "analysis"));
  if (!row) return { analysis: withDefaults(null), customized: false };
  let stored: unknown = null;
  try {
    stored = JSON.parse(row.value);
  } catch {}
  return { analysis: withDefaults(stored), customized: true };
}

export async function saveAnalysisSettings(value: AnalysisSettings) {
  const json = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key: "analysis", value: json })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: json, updatedAt: sql`(unixepoch('now', 'subsec') * 1000)` },
    });
}
