import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getPlaid } from "@/lib/plaid";
import { syncItem } from "@/lib/sync";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const publicToken = body?.public_token;
  if (typeof publicToken !== "string" || publicToken.length === 0) {
    return NextResponse.json({ error: "public_token is required" }, { status: 400 });
  }
  const institutionName =
    typeof body?.institution_name === "string" ? body.institution_name : null;

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

    const item = db.select().from(items).where(eq(items.plaidItemId, plaidItemId)).get();
    if (item) await syncItem(item);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to link account" },
      { status: 500 },
    );
  }
}
