import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid } from "@/lib/plaid";
import { safePlaidError } from "@/lib/sync";

export async function POST() {
  // Caught so Next.js never logs the raw AxiosError (config.data holds the secret).
  try {
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
  } catch (err) {
    const { error_code, request_id } = safePlaidError(err);
    console.error(
      `plaid link token failed: error_code=${error_code} request_id=${request_id}`,
    );
    return NextResponse.json({ error: "link token failed", error_code }, { status: 500 });
  }
}
