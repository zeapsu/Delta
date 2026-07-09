import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { plaid } from "@/lib/plaid";

export async function POST() {
  const res = await plaid.linkTokenCreate({
    user: { client_user_id: "delta" },
    client_name: "Delta",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
  });
  return NextResponse.json({ link_token: res.data.link_token });
}
