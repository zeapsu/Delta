// Runs once when the server starts (not during `next build`). Applies
// migrations up front, instead of on the first request, and logs the Plaid
// first-run check so `docker logs` / journalctl shows a bad .env right away.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/db");
  // The saved time zone (Settings → You) wins over TZ.
  const { applyTimeZone } = await import("@/lib/settings");
  applyTimeZone();
  const { checkPlaid } = await import("@/lib/plaid-config");
  const check = await checkPlaid();
  if (check.ok) console.log(`[delta] Plaid ${check.env}: keys OK`);
  else console.warn(`[delta] Plaid ${check.env}: ${check.problems.join("; ")}`);
}
