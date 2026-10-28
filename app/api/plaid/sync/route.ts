import { NextResponse } from "next/server";
import { safePlaidError, syncAll, syncOne } from "@/lib/sync";

// Errors are caught here so Next.js never logs a raw AxiosError (its
// config.data holds the Plaid secret and access_token). Non-2xx on any
// failure keeps `curl -f` in delta-sync.service failing visibly.
// Optional JSON body {"item_id": n} syncs one connection; no body (the
// timer's curl) syncs everything.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const itemId = body?.item_id;
  if (itemId !== undefined && !(Number.isInteger(itemId) && itemId > 0)) {
    return NextResponse.json({ error: "item_id must be a positive integer" }, { status: 400 });
  }
  try {
    const result = itemId === undefined ? await syncAll() : await syncOne(itemId);
    if (!result) {
      return NextResponse.json({ error: "unknown item" }, { status: 404 });
    }
    return NextResponse.json(result, {
      status: result.errors.length > 0 ? 502 : 200,
    });
  } catch (err) {
    const { error_code } = safePlaidError(err);
    console.error(`plaid sync aborted: error_code=${error_code}`);
    return NextResponse.json({ error: "sync failed", error_code }, { status: 500 });
  }
}
