// Mock Plaid API for the e2e suite: just the endpoints Delta calls, with a
// fixed fixture dated relative to today so month views always have data.
// The app talks to it when PLAID_MOCK_URL is set (sandbox only, lib/plaid.ts).
// Usage: node e2e/plaid-mock.mjs [port]   (default 4010)
// PLAID_MOCK_DEMO=1 swaps in a fuller, synthetic seven-month fixture for the
// README screenshots (scripts/screenshots.mjs); the e2e suite never sets it.
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.PLAID_MOCK_PORT ?? 4010);
export const ACCESS_TOKEN = "access-sandbox-mock-1";

const iso = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const today = iso(now);
// The 1st of this month and of the previous three: always <= today.
const monthStart = (back) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));

const DEMO = process.env.PLAID_MOCK_DEMO === "1";

const accounts = (DEMO ? [
  { account_id: "acc-checking", name: "Everyday Checking", type: "depository", subtype: "checking", mask: "1111", current: 4820.14, available: 4770.14 },
  { account_id: "acc-savings", name: "High-Yield Savings", type: "depository", subtype: "savings", mask: "4444", current: 18400, available: 18400 },
  { account_id: "acc-card", name: "Rewards Card", type: "credit", subtype: "credit card", mask: "2222", current: 1236.58, available: 8763.42 },
  { account_id: "acc-brokerage", name: "Brokerage", type: "investment", subtype: "brokerage", mask: "3333", current: 42150, available: null },
] : [
  { account_id: "acc-checking", name: "Everyday Checking", type: "depository", subtype: "checking", mask: "1111", current: 2500, available: 2450 },
  { account_id: "acc-card", name: "Rewards Card", type: "credit", subtype: "credit card", mask: "2222", current: 640.25, available: 4359.75 },
  { account_id: "acc-brokerage", name: "Brokerage", type: "investment", subtype: "brokerage", mask: "3333", current: 10000, available: null },
]).map((a) => ({
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
// Demo: invented merchants and amounts, six months, only dates up to today.
const day = (back, d) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, d)));
const wobble = (i) => ((i * 37) % 17) / 17; // deterministic 0..1
if (DEMO) for (let back = 0; back < 7; back++) {
  const rows = [
    [1, "acc-checking", "Northwind Payroll", -3850, "INCOME", "INCOME_WAGES"],
    [15, "acc-checking", "Northwind Payroll", -3850, "INCOME", "INCOME_WAGES"],
    [1, "acc-checking", "Maple Court Apartments", 1950, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"],
    [6, "acc-card", "City Power & Light", 68 + 30 * wobble(back), "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"],
    [9, "acc-card", "Fiberline Internet", 60, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"],
    [3, "acc-card", "Streamflix", 15.49, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"],
    [12, "acc-card", "Tunebox Music", 10.99, "ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO"],
    [2, "acc-card", "Ironworks Fitness", 45, "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"],
    [20, "acc-checking", "Rewards Card Payment", 1400, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"],
    [16, "acc-checking", "Transfer to Savings", 600, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"],
    [18, "acc-card", "Harbor Outfitters", 40 + 140 * wobble(back + 3), "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES"],
    [24, "acc-card", "Parcelhub", 25 + 90 * wobble(back + 7), "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"],
  ];
  for (let w = 0; w < 4; w++) {
    rows.push(
      [2 + w * 7, "acc-card", "Green Basket Market", 70 + 45 * wobble(back * 4 + w), "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"],
      [4 + w * 7, "acc-card", w % 2 ? "Little Lantern Noodles" : "Oak & Ember Bistro", 22 + 40 * wobble(back * 5 + w), "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"],
      [3 + w * 7, "acc-card", "Daybreak Coffee", 5.75, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"],
      [5 + w * 7, "acc-card", w % 2 ? "QuickRide" : "Fuel Stop", 14 + 30 * wobble(back * 3 + w), "TRANSPORTATION", w % 2 ? "TRANSPORTATION_TAXIS_AND_RIDE_SHARES" : "TRANSPORTATION_GAS"],
    );
  }
  if (back === 2) rows.push([10, "acc-card", "Skyway Airlines", 386.2, "TRAVEL", "TRAVEL_FLIGHTS"]);
  for (const [d, acct, name, amount, primary, detailed] of rows) {
    const date = day(back, d);
    if (date <= today) transactions.push(tx(acct, date, name, Math.round(amount * 100) / 100, primary, detailed));
  }
}
if (DEMO) transactions.push(tx("acc-card", today, "Daybreak Coffee", 5.75, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", { pending: true }));
for (let back = 0; back < 4 && !DEMO; back++) {
  const d = monthStart(back);
  transactions.push(
    tx("acc-checking", d, "ACME PAYROLL", -3000, "INCOME", "INCOME_WAGES"),
    tx("acc-card", d, "Netflix", 15.49, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"),
    tx("acc-card", d, "Corner Grocer", 82.4 + back * 10, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
    tx("acc-checking", d, "Rewards Card Payment", 500, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"),
    tx("acc-checking", d, "Transfer to Savings", 200, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"),
  );
}
if (!DEMO) transactions.push(tx("acc-card", today, "Blue Bottle Coffee", 4.5, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", { pending: true }));

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
  "/item/remove": () => ({ request_id: "mock" }),
  "/accounts/balance/get": () => ({ accounts, item: { item_id: "mock-item-1" } }),
  // "cursor-N" = the first N batches were delivered. No cursor replays all.
  "/transactions/sync": (body) => {
    const seen = Number(/^cursor-(\d+)$/.exec(body.cursor ?? "")?.[1] ?? 0);
    const fresh = batches.slice(seen);
    return {
      added: fresh.flatMap((b) => b.added),
      modified: [],
      removed: fresh.flatMap((b) => b.removed).map((transaction_id) => ({ transaction_id })),
      next_cursor: `cursor-${batches.length}`,
      has_more: false,
      accounts: fresh.length ? accounts : [],
    };
  },
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

// What /transactions/sync hands out, in order. The fixture is the first batch.
const batches = [{ added: transactions, removed: [] }];

// Test control: POST /__mock/fail {"code": "ITEM_LOGIN_REQUIRED"} makes the
// item's syncs fail with that Plaid error until {"code": null}.
let failCode = null;

// Test controls for a charge that posts. POST /__mock/pending {"name"} queues
// a pending transaction for the next sync; POST /__mock/post {"transaction_id"}
// queues its posted twin (a new id pointing back at it) and removes the
// pending one, as Plaid does. Dated over a year back and labelled a transfer,
// so no total the other specs assert on moves.
const longAgo = iso(new Date(Date.now() - 400 * 86_400_000));
const controls = {
  "/__mock/fail": (body) => ({ failCode: (failCode = body.code ?? null) }),
  "/__mock/pending": (body) => {
    const t = tx("acc-checking", longAgo, body.name, 12.34, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", { pending: true });
    batches.push({ added: [t], removed: [] });
    return { transaction_id: t.transaction_id };
  },
  "/__mock/post": (body) => {
    const pending = batches.flatMap((b) => b.added).find((t) => t.transaction_id === body.transaction_id);
    const posted = { ...pending, transaction_id: `tx-${++n}`, pending: false, pending_transaction_id: pending.transaction_id };
    batches.push({ added: [posted], removed: [pending.transaction_id] });
    return { transaction_id: posted.transaction_id };
  },
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === "/health") return send(res, 200, { ok: true });
      if (controls[req.url]) return send(res, 200, controls[req.url](body));
      // Any keys work except this secret, so the setup page's rejection shows.
      if (req.headers["plaid-secret"] === "rejected-secret") return plaidError(res, "INVALID_API_KEYS");
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
