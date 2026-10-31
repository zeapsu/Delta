// Mock Plaid API for the e2e suite: just the endpoints Delta calls, with a
// fixed fixture dated relative to today so month views always have data.
// The app talks to it when PLAID_MOCK_URL is set (sandbox only, lib/plaid.ts).
// Usage: node e2e/plaid-mock.mjs [port]   (default 4010)
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.PLAID_MOCK_PORT ?? 4010);
export const ACCESS_TOKEN = "access-sandbox-mock-1";

const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const today = iso(now);
// The 1st of this month and of the previous three: always <= today.
const monthStart = (back) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));

const accounts = [
  { account_id: "acc-checking", name: "Everyday Checking", type: "depository", subtype: "checking", mask: "1111", current: 2500, available: 2450 },
  { account_id: "acc-card", name: "Rewards Card", type: "credit", subtype: "credit card", mask: "2222", current: 640.25, available: 4359.75 },
  { account_id: "acc-brokerage", name: "Brokerage", type: "investment", subtype: "brokerage", mask: "3333", current: 10000, available: null },
].map((a) => ({
  account_id: a.account_id,
  name: a.name,
  official_name: null,
  type: a.type,
  subtype: a.subtype,
  mask: a.mask,
  balances: { current: a.current, available: a.available, iso_currency_code: "USD", limit: null, unofficial_currency_code: null },
}));

let n = 0;
const tx = (account_id, date, name, amount, primary, detailed, extra = {}) => ({
  transaction_id: `tx-${++n}`,
  account_id,
  amount,
  date,
  authorized_date: date,
  name,
  merchant_name: extra.merchant ?? name,
  pending: extra.pending ?? false,
  pending_transaction_id: null,
  iso_currency_code: "USD",
  personal_finance_category: { primary, detailed, confidence_level: "HIGH" },
});

const transactions = [];
for (let back = 0; back < 4; back++) {
  const d = monthStart(back);
  transactions.push(
    tx("acc-checking", d, "ACME PAYROLL", -3000, "INCOME", "INCOME_WAGES"),
    tx("acc-card", d, "Netflix", 15.49, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"),
    tx("acc-card", d, "Corner Grocer", 82.4 + back * 10, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
    tx("acc-checking", d, "Rewards Card Payment", 500, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
    tx("acc-checking", d, "Transfer to Savings", 200, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"),
  );
}
transactions.push(tx("acc-card", today, "Blue Bottle Coffee", 4.5, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", { pending: true }));

const plaidError = (res, code, status = 400) =>
  send(res, status, {
    error_type: "INVALID_REQUEST",
    error_code: code,
    error_message: `mock: ${code}`,
    display_message: null,
    request_id: "mock-request",
  });

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const routes = {
  // The first-run key check (lib/plaid-config.ts).
  "/institutions/get": () => ({ institutions: [], total: 0 }),
  "/link/token/create": () => ({ link_token: "link-sandbox-mock", expiration: new Date(Date.now() + 3600e3).toISOString() }),
  "/item/public_token/exchange": () => ({ access_token: ACCESS_TOKEN, item_id: "mock-item-1" }),
  "/transactions/refresh": () => ({}),
  "/accounts/balance/get": () => ({ accounts, item: { item_id: "mock-item-1" } }),
  "/transactions/sync": (body) =>
    body.cursor === "cursor-1"
      ? { added: [], modified: [], removed: [], next_cursor: "cursor-1", has_more: false, accounts: [] }
      : { added: transactions, modified: [], removed: [], next_cursor: "cursor-1", has_more: false, accounts },
  "/item/get": () => ({
    item: {
      item_id: "mock-item-1",
      institution_id: "ins_mock",
      products: ["transactions"],
      billed_products: ["transactions"],
      consented_products: ["transactions"],
      available_products: ["investments"],
    },
  }),
  // Linked before investments consent: Delta must log-skip this, not fail the sync.
  "/investments/transactions/get": () => "ADDITIONAL_CONSENT_REQUIRED",
};

// Test control: POST /__mock/fail {"code": "ITEM_LOGIN_REQUIRED"} makes the
// item's syncs fail with that Plaid error until {"code": null}.
let failCode = null;

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === "/health") return send(res, 200, { ok: true });
      if (req.url === "/__mock/fail") {
        failCode = body.code ?? null;
        return send(res, 200, { failCode });
      }
      const route = routes[req.url];
      if (!route) return plaidError(res, "NOT_FOUND", 404);
      if (req.url !== "/link/token/create" && req.url !== "/item/public_token/exchange" && req.url !== "/institutions/get" && body.access_token !== ACCESS_TOKEN) {
        return plaidError(res, "INVALID_ACCESS_TOKEN");
      }
      if (failCode && req.url === "/transactions/sync") return plaidError(res, failCode);
      const out = route(body);
      if (typeof out === "string") return plaidError(res, out);
      send(res, 200, { ...out, request_id: "mock-request" });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`plaid mock on http://127.0.0.1:${port}`));
