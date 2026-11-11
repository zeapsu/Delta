import { NextResponse } from "next/server";
import { sentByAgent } from "@/lib/agent-config";
import { removeItem, safePlaidError } from "@/lib/sync";

// Body: { item_id }. Removes a connection: the item at Plaid, then its
// accounts, transactions and balance history here (lib/sync.ts). Dashboard
// only: it can't be undone, so there is no v1 route and agents are refused.
export async function DELETE(req: Request) {
  if (sentByAgent(req)) {
    return NextResponse.json({ error: "Agents can't remove a connection" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const itemId = body?.item_id;
  if (!(Number.isInteger(itemId) && itemId > 0)) {
    return NextResponse.json({ error: "item_id must be a positive integer" }, { status: 400 });
  }
  // Caught so Next.js never logs a raw AxiosError (its config.data holds the
  // Plaid secret and access_token).
  try {
    const result = await removeItem(itemId);
    if (result === "unknown") return NextResponse.json({ error: "unknown item" }, { status: 404 });
    if (result !== "removed") {
      return NextResponse.json(
        { error: "Plaid couldn't remove this connection. Nothing was deleted; try again.", error_code: result.error_code },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { error_code } = safePlaidError(err);
    console.error(`plaid item remove aborted: item=${itemId} error_code=${error_code}`);
    return NextResponse.json({ error: "Couldn't remove this connection", error_code }, { status: 500 });
  }
}
