import { NextResponse } from "next/server";

// Self-description for agents and the MCP server. Every route needs
// "Authorization: Bearer <token>"; GETs need read scope, writes need write.
// Money is integer cents; transaction amounts use the Plaid sign
// (positive = money out). Dates are YYYY-MM-DD, months YYYY-MM.
export async function GET() {
  return NextResponse.json({
    version: 1,
    conventions: {
      money: "integer cents",
      transactionSign: "positive = money out, negative = money in",
      spend: "excludes TRANSFER%, INCOME and LOAN_DISBURSEMENTS categories and credit card payments (categoryDetailed LOAN_PAYMENTS_CREDIT_CARD_PAYMENT); includes uncategorized and other loan payments",
      debt: "credit/loan balances are positive amounts owed; net worth negates them",
    },
    mcp: {
      path: "/api/v1/mcp",
      transport: "streamable-http (stateless, JSON responses)",
      about: "the same data as MCP tools, money in dollars; send the bearer token as a header",
    },
    endpoints: [
      { method: "GET", path: "/api/v1/status", about: "data freshness and per-connection sync health" },
      { method: "GET", path: "/api/v1/settings", about: "the user's analysis thresholds (customized false = defaults); edited on /settings in the app" },
      { method: "GET", path: "/api/v1/accounts", about: "accounts with current balances" },
      {
        method: "GET",
        path: "/api/v1/transactions",
        params: "from, to (YYYY-MM-DD), month (YYYY-MM), account_id, category, q, pending (true|false), limit (1-500, default 100), offset",
        about: "transactions (posted date + authorizedDate, the purchase date or null), newest first by posted date, paged",
      },
      {
        method: "POST",
        path: "/api/v1/transactions/category",
        body: '{"id","category" (Plaid primary, or null to undo),"merchant" (true = every transaction from this merchant, now and future)}',
        about: "relabel a transaction's category (write scope)",
      },
      { method: "GET", path: "/api/v1/cash-flow", params: "months (1-36, default 6), end (YYYY-MM)", about: "posted income vs spend per month" },
      { method: "GET", path: "/api/v1/spending", params: "month (YYYY-MM, default this month), date_basis (posted|authorized, default posted)", about: "spend per category" },
      { method: "GET", path: "/api/v1/budgets", params: "month", about: "budgets with progress" },
      { method: "POST", path: "/api/v1/budgets", body: '{"category","monthlyAmount"}', about: "upsert a budget (write scope)" },
      { method: "DELETE", path: "/api/v1/budgets", body: '{"category"}', about: "remove a budget (write scope)" },
      { method: "GET", path: "/api/v1/recurring", about: "confirmed recurring charges and unreviewed suggestions" },
      { method: "POST|PUT|DELETE", path: "/api/v1/recurring", about: "create/edit/remove a recurring rule (write scope)" },
      { method: "GET", path: "/api/v1/investments", params: "account_id, from, to, limit, offset", about: "investment activity (never spend)" },
      { method: "GET", path: "/api/v1/net-worth", params: "from (YYYY-MM-DD)", about: "net worth now and daily history" },
    ],
  });
}
