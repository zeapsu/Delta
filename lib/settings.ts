import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { withDefaults, type AnalysisSettings } from "@/lib/analysis";
import { parseStoredKeys, resolvePlaidKeys, SETTINGS_KEY, type PlaidKeys, type StoredPlaidKeys } from "@/lib/plaid-keys";

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

// Plaid keys in effect: the environment's, else the ones saved on /setup
// (lib/plaid-keys.ts). Synchronous so getPlaid() stays synchronous.
export function currentPlaidKeys(): PlaidKeys {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, SETTINGS_KEY)).get();
  return resolvePlaidKeys(process.env, parseStoredKeys(row?.value));
}

export function savePlaidKeys(keys: StoredPlaidKeys) {
  const json = JSON.stringify(keys);
  db.insert(settings)
    .values({ key: SETTINGS_KEY, value: json })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: json, updatedAt: sql`(unixepoch('now', 'subsec') * 1000)` },
    })
    .run();
}
