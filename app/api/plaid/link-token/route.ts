import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid } from "@/lib/plaid";

export async function POST() {
  const res = await getPlaid().linkTokenCreate({
    user: { client_user_id: "delta" },
    client_name: "Delta",
    products: [Products.Transactions],
    // Carries investments consent on new/re-linked items without forcing
    // billing for institutions that don't support it.
    optional_products: [Products.Investments],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return NextResponse.json({ link_token: res.data.link_token });
}
