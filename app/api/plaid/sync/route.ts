import { NextResponse } from "next/server";
import { safePlaidError, syncAll } from "@/lib/sync";

// Errors are caught here so Next.js never logs a raw AxiosError (its
// config.data holds the Plaid secret and access_token). Non-2xx on any
// failure keeps `curl -f` in delta-sync.service failing visibly.
export async function POST() {
  try {
    const result = await syncAll();
    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 502 : 200,
    });
  } catch (err) {
    const { error_code } = safePlaidError(err);
    console.error(`plaid sync aborted: error_code=${error_code}`);
    return NextResponse.json({ error: "sync failed", error_code }, { status: 500 });
  }
}
