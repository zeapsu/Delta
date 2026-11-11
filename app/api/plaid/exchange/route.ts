import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getPlaid } from "@/lib/plaid";
import { safePlaidError, syncOne } from "@/lib/sync";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const publicToken = body?.public_token;
  if (typeof publicToken !== "string" || publicToken.length === 0) {
    return NextResponse.json({ error: "public_token is required" }, { status: 400 });
  }
  // Shown on every page and sent to agents, so keep it a short label.
  const institutionName =
    typeof body?.institution_name === "string" && body.institution_name.trim()
      ? body.institution_name.trim().slice(0, 100)
      : null;

  let item: typeof items.$inferSelect | undefined;
  try {
    const exchangeRes = await getPlaid().itemPublicTokenExchange({
      public_token: publicToken,
    });
    const { item_id: plaidItemId, access_token: accessToken } = exchangeRes.data;

    db
      .insert(items)
      .values({ plaidItemId, accessToken, institutionName })
      .onConflictDoNothing({ target: items.plaidItemId })
      .run();

    item = db.select().from(items).where(eq(items.plaidItemId, plaidItemId)).get();
  } catch (err) {
    const { error_code, request_id } = safePlaidError(err);
    console.error(
      `plaid exchange failed: error_code=${error_code} request_id=${request_id}`,
    );
    return NextResponse.json(
      { error: "Failed to link account", error_code },
      { status: 500 },
    );
  }

  // The item is saved at this point. A failed first sync (often just
  // PRODUCT_NOT_READY right after linking) must not report "link failed" —
  // the user would link again and end up with a duplicate item. The next
  // timer or manual sync picks it up. syncOne queues behind any run in
  // progress and records the outcome on the item, like every other sync.
  try {
    const result = item ? await syncOne(item.id) : null;
    const syncError = result?.errors[0]?.error_code;
    if (syncError) return NextResponse.json({ ok: true, syncError });
  } catch (err) {
    const { error_code, request_id } = safePlaidError(err);
    console.error(
      `plaid initial sync failed: item=${item?.id} error_code=${error_code} request_id=${request_id}`,
    );
    return NextResponse.json({ ok: true, syncError: error_code });
  }
  return NextResponse.json({ ok: true });
}
