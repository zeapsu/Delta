import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getPlaid } from "@/lib/plaid";
import { safePlaidError } from "@/lib/sync";

// No body: a token for linking a new item. `{ item_id }`: an update-mode token
// that re-authenticates that existing item in place (#62), so its accounts and
// history stay and no public-token exchange follows. `{ item_id, investments:
// true }` also asks the user to consent to investments — items linked before
// investments became an optional product never granted it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const itemId = body?.item_id;
  if (itemId !== undefined && !Number.isInteger(itemId)) {
    return NextResponse.json({ error: "item_id must be an integer" }, { status: 400 });
  }
  const addInvestments = body?.investments === true;
  if (addInvestments && itemId === undefined) {
    return NextResponse.json({ error: "investments requires item_id" }, { status: 400 });
  }

  const request: LinkTokenCreateRequest = {
    user: { client_user_id: "delta" },
    client_name: "Delta",
    country_codes: [CountryCode.Us],
    language: "en",
  };
  if (itemId !== undefined) {
    const item = db.select().from(items).where(eq(items.id, itemId)).get();
    if (!item) return NextResponse.json({ error: "unknown item" }, { status: 404 });
    // Update mode: the access token selects the item; `products` must be omitted.
    request.access_token = item.accessToken;
    if (addInvestments) request.additional_consented_products = [Products.Investments];
  } else {
    request.products = [Products.Transactions];
    // Carries investments consent on new items without forcing billing for
    // institutions that don't support it.
    request.optional_products = [Products.Investments];
  }

  // Caught so Next.js never logs the raw AxiosError (config.data holds the secret).
  try {
    const res = await getPlaid().linkTokenCreate(request);
    return NextResponse.json({ link_token: res.data.link_token });
  } catch (err) {
    const { error_code, request_id } = safePlaidError(err);
    console.error(
      `plaid link token failed: item=${itemId ?? "new"} error_code=${error_code} request_id=${request_id}`,
    );
    return NextResponse.json({ error: "link token failed", error_code }, { status: 500 });
  }
}
