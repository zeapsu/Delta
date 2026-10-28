import "server-only";
import { Products } from "plaid";
import { getPlaid } from "@/lib/plaid";
import { safePlaidError } from "@/lib/sync";

export type InvestmentsAccess =
  | "active" // investments initialized on the item
  | "consented" // consent granted; the next sync initializes it
  | "needs_consent" // institution supports it, user never granted it
  | "unsupported" // institution doesn't offer investments data via Plaid
  | "error";

// Why an item with investment accounts has no investment activity. Items
// linked before investments was an optional product (2026-07-09) only consented
// to transactions, so /investments/transactions/get answers
// ADDITIONAL_CONSENT_REQUIRED and the sync log-skips it every run.
export async function investmentsAccess(accessToken: string): Promise<InvestmentsAccess> {
  try {
    const { item } = (await getPlaid().itemGet({ access_token: accessToken })).data;
    const has = (list?: Products[] | null) => list?.includes(Products.Investments) ?? false;
    if (has(item.products) || has(item.billed_products)) return "active";
    if (has(item.consented_products)) return "consented";
    if (has(item.available_products)) return "needs_consent";
    return "unsupported";
  } catch (err) {
    const e = safePlaidError(err);
    console.error(`plaid item get failed: error_code=${e.error_code} request_id=${e.request_id}`);
    return "error";
  }
}
