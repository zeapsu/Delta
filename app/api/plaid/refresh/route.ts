import { NextResponse } from "next/server";
import { refreshAll } from "@/lib/sync";

// Asks Plaid to re-check every bank for new transactions now. The results
// land asynchronously, so the delta-sync timer waits a few minutes before
// it POSTs /api/plaid/sync. Items that can't refresh are reported in
// `skipped` but don't fail the request.
export async function POST() {
  return NextResponse.json(await refreshAll());
}
