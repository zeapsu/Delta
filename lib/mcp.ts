// MCP (Model Context Protocol) server over the /api/v1 agent API, issue #73.
// Pure protocol + tool layer, no DB imports: every tool calls the API through
// the `api` function it is given (app/api/v1/mcp/route.ts dispatches to the
// v1 route handlers in-process). Self-check: lib/mcp-check.ts.
//
// Design carried over from the retired Python snapshot server: fixed, typed
// tools (no query passthrough, strict args, unknown args rejected), an as_of
// block with stale warnings on every answer, the finance conventions in the
// server instructions and tool descriptions (no separate skill install), and
// money in dollars. The API stays in cents; conversion happens here.
import pkg from "@/package.json";
import type { Scope } from "@/lib/api-auth";
import { CATEGORIES } from "@/lib/categories";
import { todayISO } from "@/lib/months";
import { ANALYSIS_DEFAULTS, analysisText, withDefaults, type AnalysisSettings } from "@/lib/analysis";

// The release version (scripts/set-version.sh sets it after each release).
export const SERVER_INFO = { name: "delta", version: pkg.version };
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const STALE_DAYS = 3;

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Api = (
  method: ApiMethod,
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
) => Promise<{ status: number; data: unknown }>;

// {{ANALYSIS}} is filled from the user's analysis settings at initialize.
const INSTRUCTIONS_TEMPLATE = `Delta is the user's personal finance app (bank data synced from Plaid). These tools read it through Delta's API.

Conventions:
- Money is in dollars (2 decimals). Transaction and investment amounts use the Plaid sign: positive = money out (spend), negative = money in (income, refunds).
- "Spend" excludes transfers between the user's own accounts (TRANSFER_IN/TRANSFER_OUT), INCOME, LOAN_DISBURSEMENTS (loan money in, including some card payment credits) and credit card payments (categoryDetailed LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: the card purchases are already counted), and includes uncategorized rows. Other LOAN_PAYMENTS (student, auto, mortgage) count as spend. Totals from spending_by_category, cash_flow and get_budgets are computed by Delta and match the dashboard: use them instead of adding up transactions yourself.
- Credit card and loan balances are positive amounts owed; net worth subtracts them.
- Pending transactions (pending: true in search_transactions) are charges the bank has authorized but not posted. Spend totals (spending_by_category, cash_flow, get_budgets) include them, and pendingTotal / pendingSpending say how much of a total is still pending. Pending amounts can still change or disappear (e.g. a refundable hold), so say which charges are pending when they matter, and leave them out when reconciling against a statement.
- Categories are Plaid's labels (e.g. FOOD_AND_DRINK) unless the user relabeled a transaction or merchant in Delta; relabels already apply to every total, and plaidCategory in search_transactions keeps the bank's label. Plaid's labels can be wrong; list the transactions behind a surprising number before drawing conclusions.
- Recurring: "confirmed" rules are user-reviewed truth; "suggestions" are unreviewed guesses, never count them in totals. "possiblyEnded" rules missed about two expected charges and are out of totals until the user says whether they are still active (ask them, then call set_recurring_status); "ended" rules are ones the user said stopped, and one comes back to confirmed by itself if its charge posts again.

Every answer has an as_of block. If it carries warnings (data older than ${STALE_DAYS} days, a bank connection whose last sync failed, or a sync still running), tell the user and caveat your conclusions with the last sync date.

Freshness: read tools sync with the banks first when Delta's data is more than 15 minutes old (as_of.synced_now says this answer did). Balances are then current, but banks report new transactions to Plaid only a few times a day; when Delta has asked them to re-check, as_of.next_sync says when the results will be in. Call sync only when the user wants the newest data or a charge they expect is missing, not before every question.

{{ANALYSIS}}

Privacy: this data is private. Never send transaction lists to third-party services, and don't mention account masks or numbers unless the user asks.

Advice: ground every claim in numbers you just fetched. Budgeting, spending patterns, subscriptions and cash flow are in scope; no specific investment, securities, tax or legal advice. Only call a write tool (set_budget, recurring rules, category relabels) after the user explicitly agrees. Never repeat the API token.`;

export function instructions(settings: AnalysisSettings = ANALYSIS_DEFAULTS): string {
  return INSTRUCTIONS_TEMPLATE.replace("{{ANALYSIS}}", analysisText(settings));
}

// ---------- argument schemas + validation ----------

type Prop = {
  type: "string" | "integer" | "number" | "boolean";
  description: string;
  pattern?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
};
type Args = Record<string, string | number | boolean>;

const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const MONTH = { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } as const;
const CATEGORY = {
  type: "string",
  pattern: "^[A-Z_]{1,64}$",
  description: "Plaid primary category, e.g. FOOD_AND_DRINK, GENERAL_MERCHANDISE, RENT_AND_UTILITIES",
} as const;
const RELABEL: Prop = {
  type: "string",
  enum: [...CATEGORIES],
  description: "New Plaid primary category, e.g. FOOD_AND_DRINK",
};
const ALL_FROM_MERCHANT = {
  type: "boolean",
  description:
    "true = every transaction from this merchant (matched on merchantName, or name when there is none), including ones from future syncs; default false = only this transaction",
} as const;
const DOLLARS = { type: "number", exclusiveMinimum: 0, maximum: 1_000_000 } as const;
const ID = { type: "integer", minimum: 1 } as const;
const LIMIT = { type: "integer", minimum: 1, maximum: 500, description: "Page size, default 100" } as const;
const OFFSET = { type: "integer", minimum: 0, description: "Rows to skip; use next_offset from the previous page" } as const;

export class ArgError extends Error {}

export function validateArgs(
  props: Record<string, Prop>,
  required: string[],
  raw: unknown,
): Args {
  const args = raw ?? {};
  if (typeof args !== "object" || Array.isArray(args)) throw new ArgError("arguments must be an object");
  for (const key of required) {
    if (!Object.hasOwn(args, key)) throw new ArgError(`missing required argument: ${key}`);
  }
  const out: Args = {};
  for (const [key, value] of Object.entries(args)) {
    // Own keys only: "constructor" or "__proto__" must not pass as known.
    const p = Object.hasOwn(props, key) ? props[key] : undefined;
    if (!p) throw new ArgError(`unknown argument: ${key}`);
    if (value === null || value === undefined) continue;
    const ok =
      p.type === "string" ? typeof value === "string"
      : p.type === "boolean" ? typeof value === "boolean"
      : p.type === "integer" ? typeof value === "number" && Number.isInteger(value)
      : typeof value === "number" && Number.isFinite(value);
    if (!ok) throw new ArgError(`${key} must be a${p.type === "integer" ? "n" : ""} ${p.type}`);
    if (p.pattern && !new RegExp(p.pattern).test(value as string)) {
      throw new ArgError(`${key} must match ${p.pattern}`);
    }
    if (p.enum && !p.enum.includes(value as string)) throw new ArgError(`${key} must be one of ${p.enum.join(", ")}`);
    if (typeof value === "number") {
      if (p.minimum !== undefined && value < p.minimum) throw new ArgError(`${key} must be >= ${p.minimum}`);
      if (p.maximum !== undefined && value > p.maximum) throw new ArgError(`${key} must be <= ${p.maximum}`);
      if (p.exclusiveMinimum !== undefined && value <= p.exclusiveMinimum) {
        throw new ArgError(`${key} must be > ${p.exclusiveMinimum}`);
      }
    }
    out[key] = value as string | number | boolean;
  }
  return out;
}

// ---------- cents -> dollars ----------

// Converts the named cent fields anywhere in a response to dollars. Field
// names are per tool, since e.g. `total` is a row count on paged endpoints.
export function toDollars(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => toDollars(v, keys));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        keys.has(k) && typeof v === "number" ? Math.round(v) / 100 : toDollars(v, keys),
      ]),
    );
  }
  return value;
}

export const cents = (dollars: number) => Math.round(dollars * 100);

// ---------- freshness ----------

type Status = {
  lastTransaction: string | null;
  lastSnapshot: string | null;
  lastInvestment: string | null;
  connections: { id: number; institution: string | null; lastSyncedAt: string | null; lastErrorCode: string | null }[];
};

export type AsOf = {
  last_transaction: string | null;
  last_balance_snapshot: string | null;
  last_sync: string | null;
  synced_now: boolean;
  next_sync?: string;
  warnings: string[];
};

// What POST /api/v1/sync answered (lib/fresh-sync.ts SyncOutcome).
export type SyncOutcome = { status: string; next_sync_at: string | null };

export function asOf(s: Status, today: string = todayISO(), sync: SyncOutcome | null = null): AsOf {
  const warnings: string[] = [];
  if (sync?.status === "running") {
    warnings.push("A sync with the banks was still running when this answered, so the newest data may be missing; ask again in a minute.");
  }
  const newest = [s.lastTransaction, s.lastSnapshot].filter((d): d is string => !!d).sort().at(-1);
  if (!newest) {
    warnings.push("No synced data yet.");
  } else {
    const age = Math.round((Date.parse(today) - Date.parse(newest)) / 86_400_000);
    if (age > STALE_DAYS) warnings.push(`Data is stale: newest data is from ${newest} (${age} days ago).`);
  }
  for (const c of s.connections) {
    if (c.lastErrorCode) {
      warnings.push(
        `${c.institution ?? `Connection ${c.id}`}: last sync failed (${c.lastErrorCode}); its data may be out of date.`,
      );
    }
  }
  const synced = s.connections.map((c) => c.lastSyncedAt).filter((d): d is string => !!d).sort();
  return {
    last_transaction: s.lastTransaction,
    last_balance_snapshot: s.lastSnapshot,
    last_sync: synced.at(-1) ?? null,
    synced_now: sync?.status === "synced",
    ...(sync?.next_sync_at ? { next_sync: sync.next_sync_at } : {}),
    warnings,
  };
}

// ---------- tools ----------

type Tool = {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  props: Record<string, Prop>;
  required?: string[];
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: Args, api: Api) => Promise<unknown>;
};

class ApiError extends Error {}

async function call(api: Api, ...a: Parameters<Api>): Promise<unknown> {
  const { status, data } = await api(...a);
  if (status >= 400) {
    const msg = (data as { error?: string } | null)?.error ?? "request failed";
    throw new ApiError(`Delta API ${status}: ${msg}`);
  }
  return data;
}

const read = (path: string, keys: string[], query?: (a: Args) => Record<string, string | number | boolean | undefined>) => {
  const set = new Set(keys);
  return async (a: Args, api: Api) => toDollars(await call(api, "GET", path, { query: query?.(a) ?? a }), set);
};

const pagedRename = (data: unknown) => {
  const { nextOffset, total, ...rest } = data as { nextOffset: number | null; total: number };
  return { ...rest, total_count: total, next_offset: nextOffset };
};

const READ_HINTS = { readOnlyHint: true, idempotentHint: true };

export const TOOLS: Tool[] = [
  {
    name: "get_status",
    title: "Data freshness and connection health",
    description:
      "Check that Delta is reachable and how fresh the data is: newest transaction and balance dates, and each bank connection's last sync time and error code (non-null = that connection's last sync failed). Call this first in a conversation about the user's money.",
    scope: "read",
    props: {},
    annotations: READ_HINTS,
    run: async (_a, api) => call(api, "GET", "/api/v1/status"),
  },
  {
    name: "sync",
    title: "Sync with the banks now",
    description:
      "Pull the newest data from the user's banks now and ask them to re-check for new transactions. Read tools already sync on their own when data is over 15 minutes old, so use this only when the user asks for the latest or a charge they expect is missing. Transactions from the re-check arrive a few minutes later: next_sync_at is when Delta syncs again on its own to pick them up. status: synced (added/modified/removed counts; errors lists connections that failed), running (still going, ask again in a minute), throttled (the banks were asked less than 5 minutes ago; wait for next_sync_at), no_connections (no bank linked).",
    scope: "read",
    props: {},
    annotations: { idempotentHint: true, openWorldHint: true },
    run: async (_a, api) => {
      const { result, ...rest } = (await call(api, "POST", "/api/v1/sync")) as { result?: object };
      return { ...rest, ...result };
    },
  },
  {
    name: "list_accounts",
    title: "Accounts and balances",
    description:
      "All linked accounts with current and available balances (dollars), type (depository, credit, loan, investment) and institution. Credit and loan balances are positive amounts owed.",
    scope: "read",
    props: {},
    annotations: READ_HINTS,
    run: read("/api/v1/accounts", ["currentBalance", "availableBalance"]),
  },
  {
    name: "search_transactions",
    title: "Search transactions",
    description:
      "Bank and card transactions, newest first by posted date, paged. date is the posted date; authorizedDate is when the purchase happened (null when the bank doesn't report it) and can fall in an earlier month near a month boundary. Date filters use the posted date. amount is dollars with positive = money out, negative = money in. pending: true marks a charge that has not posted yet and can still change or disappear; call it pending when you mention it. Use this to find specific charges or to check the transactions behind a total; for totals use spending_by_category or cash_flow instead of adding these up. Investment buys/sells are not here (see investment_activity).",
    scope: "read",
    props: {
      from: { ...DATE, description: "Earliest date, YYYY-MM-DD" },
      to: { ...DATE, description: "Latest date, YYYY-MM-DD" },
      month: { ...MONTH, description: "Only this month, YYYY-MM" },
      account_id: { ...ID, description: "Only this account (id from list_accounts)" },
      category: { ...CATEGORY, description: `${CATEGORY.description}; UNCATEGORIZED matches rows with no category` },
      q: { type: "string", description: "Case-insensitive substring of the transaction or merchant name" },
      pending: { type: "boolean", description: "true = only pending, false = only posted" },
      limit: LIMIT,
      offset: OFFSET,
    },
    annotations: READ_HINTS,
    run: async (a, api) =>
      pagedRename(toDollars(await call(api, "GET", "/api/v1/transactions", { query: a }), new Set(["amount"]))),
  },
  {
    name: "spending_by_category",
    title: "Spending by category",
    description:
      "Spend per category for one month, biggest first, in dollars: total (pending charges included) and pendingTotal (the still-pending part of total) per category plus month totals. Uses Delta's spend rule (no transfers or income; refunds net within a category). Matches the dashboard's spending page with the default date_basis=posted; date_basis=authorized buckets by purchase date instead (posted date when unknown), e.g. a charge made Oct 31 that posted Nov 2 counts in October.",
    scope: "read",
    props: {
      month: { ...MONTH, description: "YYYY-MM, default this month (partial)" },
      date_basis: {
        type: "string",
        enum: ["posted", "authorized"],
        description: "posted (default, matches the dashboard) or authorized (purchase date, falling back to posted)",
      },
    },
    annotations: READ_HINTS,
    run: read("/api/v1/spending", ["total", "pendingTotal"]),
  },
  {
    name: "cash_flow",
    title: "Monthly income vs spending",
    description:
      "Income and spending per month in dollars, oldest first; spending includes pending charges and pendingSpending is the still-pending part. The current month is partial. Use for trends; the instructions say how many months of movement make a trend.",
    scope: "read",
    props: {
      months: { type: "integer", minimum: 1, maximum: 36, description: "How many months, default 6" },
      end: { ...MONTH, description: "Last month, YYYY-MM, default this month" },
    },
    annotations: READ_HINTS,
    run: read("/api/v1/cash-flow", ["income", "spending", "pendingSpending"]),
  },
  {
    name: "get_budgets",
    title: "Budgets and progress",
    description:
      "Monthly budgets per category with progress for a month, in dollars: monthlyAmount, spent (pending included, refunds netted, never below 0), net (can be negative after refunds) and pct (over 100 = over budget; 80+ mid-month deserves a heads-up).",
    scope: "read",
    props: { month: { ...MONTH, description: "YYYY-MM, default this month" } },
    annotations: READ_HINTS,
    run: read("/api/v1/budgets", ["monthlyAmount", "spent", "net"]),
  },
  {
    name: "get_recurring",
    title: "Recurring charges and subscriptions",
    description:
      "Recurring charges in dollars. confirmed = rules the user reviewed that are still charging (the truth: cadence, last and next expected date; monthlyEstimate sums only these). possiblyEnded = confirmed rules with no charge for about two cycles, left out of totals; ask the user whether each is still active. ended = rules the user said stopped. suggestions = series Delta detected that the user has not reviewed yet; never count them in totals, but you can ask the user to confirm or dismiss them.",
    scope: "read",
    props: {},
    annotations: READ_HINTS,
    run: read("/api/v1/recurring", ["amount", "monthlyEstimate"]),
  },
  {
    name: "get_net_worth",
    title: "Net worth now and over time",
    description:
      "Net worth in dollars: current (the dashboard headline, live balances with credit/loan debts subtracted) and daily history, forward-filled per account so a missed sync doesn't show a false dip.",
    scope: "read",
    props: { from: { ...DATE, description: "History start, YYYY-MM-DD (omit for all history)" } },
    annotations: READ_HINTS,
    run: read("/api/v1/net-worth", ["current", "netWorth"]),
  },
  {
    name: "investment_activity",
    title: "Investment activity",
    description:
      "Brokerage/retirement activity (buys, sells, dividends, fees), newest first, paged. amount and fees in dollars (Plaid sign: positive = money out of the account's cash); price is per share. This is never spend. Describe it factually; no investment advice.",
    scope: "read",
    props: {
      from: { ...DATE, description: "Earliest date, YYYY-MM-DD" },
      to: { ...DATE, description: "Latest date, YYYY-MM-DD" },
      account_id: { ...ID, description: "Only this account (id from list_accounts)" },
      limit: LIMIT,
      offset: OFFSET,
    },
    annotations: READ_HINTS,
    run: async (a, api) =>
      pagedRename(toDollars(await call(api, "GET", "/api/v1/investments", { query: a }), new Set(["amount", "fees"]))),
  },
  // ---- writes (write-scoped tokens only; only after the user explicitly agrees) ----
  {
    name: "set_budget",
    title: "Set a monthly budget",
    description:
      "Create or change the monthly budget for a category. Only after the user explicitly agrees to the amount.",
    scope: "write",
    props: { category: CATEGORY, monthly_amount: { ...DOLLARS, description: "Monthly budget in dollars" } },
    required: ["category", "monthly_amount"],
    annotations: { idempotentHint: true },
    run: async (a, api) =>
      call(api, "POST", "/api/v1/budgets", {
        body: { category: a.category, monthlyAmount: cents(a.monthly_amount as number) },
      }),
  },
  {
    name: "delete_budget",
    title: "Remove a budget",
    description: "Remove the budget for a category. Only after the user explicitly agrees.",
    scope: "write",
    props: { category: CATEGORY },
    required: ["category"],
    annotations: { destructiveHint: true, idempotentHint: true },
    run: async (a, api) => call(api, "DELETE", "/api/v1/budgets", { body: { category: a.category } }),
  },
  {
    name: "add_recurring_rule",
    title: "Confirm or dismiss a recurring charge",
    description:
      "Record a recurring charge the user reviewed. status confirmed = it is real (counts toward totals); dismissed = hide this suggestion. To answer a suggestion from get_recurring, pass its matchKey as match_key and its merchant, amount, gapDays and lastDate. Omit match_key for a manual entry. Only after the user explicitly agrees.",
    scope: "write",
    props: {
      status: { type: "string", enum: ["confirmed", "dismissed"], description: "confirmed or dismissed" },
      name: { type: "string", description: "Display name, e.g. Netflix" },
      amount: { ...DOLLARS, description: "Charge amount in dollars" },
      gap_days: { type: "integer", minimum: 1, maximum: 1000, description: "Days between charges (30 = monthly)" },
      anchor_date: { ...DATE, description: "Last known or expected charge date, YYYY-MM-DD" },
      match_key: { type: "string", description: "The suggestion's matchKey from get_recurring" },
    },
    required: ["status", "name", "amount", "gap_days", "anchor_date"],
    run: async (a, api) =>
      call(api, "POST", "/api/v1/recurring", {
        body: {
          status: a.status,
          name: a.name,
          amount: cents(a.amount as number),
          gapDays: a.gap_days,
          anchorDate: a.anchor_date,
          matchKey: a.match_key,
        },
      }),
  },
  {
    name: "update_recurring_rule",
    title: "Edit a recurring charge",
    description: "Edit a confirmed recurring rule (id from get_recurring confirmed). To move the next charge, set anchor_date to the new expected date: it overrides the detected nextDate until a charge on or after it posts. Only after the user explicitly agrees.",
    scope: "write",
    props: {
      id: { ...ID, description: "Rule id" },
      name: { type: "string", description: "Display name" },
      amount: { ...DOLLARS, description: "Charge amount in dollars" },
      gap_days: { type: "integer", minimum: 1, maximum: 1000, description: "Days between charges" },
      anchor_date: { ...DATE, description: "Last known or expected charge date, YYYY-MM-DD" },
    },
    required: ["id", "name", "amount", "gap_days", "anchor_date"],
    annotations: { idempotentHint: true },
    run: async (a, api) =>
      call(api, "PUT", "/api/v1/recurring", {
        body: { id: a.id, name: a.name, amount: cents(a.amount as number), gapDays: a.gap_days, anchorDate: a.anchor_date },
      }),
  },
  {
    name: "set_recurring_status",
    title: "Mark a recurring charge still active or ended",
    description:
      "Answer whether a tracked recurring charge (id from get_recurring confirmed, possiblyEnded or ended) is still charging. active = keep it in totals (the possibly-ended check starts over today); ended = archive it, out of totals, and it comes back by itself if the charge posts again. Use this rather than delete_recurring_rule when a subscription stops. Only after the user explicitly agrees.",
    scope: "write",
    props: {
      id: { ...ID, description: "Rule id from get_recurring" },
      status: { type: "string", enum: ["active", "ended"], description: "active or ended" },
    },
    required: ["id", "status"],
    annotations: { idempotentHint: true },
    run: async (a, api) =>
      call(api, "PATCH", "/api/v1/recurring", {
        body: { id: a.id, status: a.status === "active" ? "confirmed" : "ended" },
      }),
  },
  {
    name: "delete_recurring_rule",
    title: "Remove a recurring charge",
    description:
      "Delete a recurring rule, e.g. when the user canceled a subscription. If the charge continues, Delta will suggest it again. Only after the user explicitly agrees.",
    scope: "write",
    props: { id: { ...ID, description: "Rule id from get_recurring" } },
    required: ["id"],
    annotations: { destructiveHint: true, idempotentHint: true },
    run: async (a, api) => call(api, "DELETE", "/api/v1/recurring", { body: { id: a.id } }),
  },
  {
    name: "set_transaction_category",
    title: "Relabel a transaction's category",
    description:
      "Change a transaction's category (id from search_transactions), e.g. a restaurant the bank filed under PERSONAL_CARE. With all_from_merchant, every transaction from that merchant is relabeled now and on future syncs. Relabels apply to spending, budgets and cash flow everywhere in Delta and survive syncs. Returns updated (rows changed). Only after the user explicitly agrees.",
    scope: "write",
    props: { id: { ...ID, description: "Transaction id" }, category: RELABEL, all_from_merchant: ALL_FROM_MERCHANT },
    required: ["id", "category"],
    annotations: { idempotentHint: true },
    run: async (a, api) =>
      call(api, "POST", "/api/v1/transactions/category", {
        body: { id: a.id, category: a.category, merchant: a.all_from_merchant ?? false },
      }),
  },
  {
    name: "reset_transaction_category",
    title: "Undo a category relabel",
    description:
      "Put a transaction back on the bank's category (plaidCategory in search_transactions). If its category comes from a merchant-wide relabel, pass all_from_merchant: true, which removes that merchant rule and resets every transaction from the merchant. Only after the user explicitly agrees.",
    scope: "write",
    props: { id: { ...ID, description: "Transaction id" }, all_from_merchant: ALL_FROM_MERCHANT },
    required: ["id"],
    annotations: { destructiveHint: true, idempotentHint: true },
    run: async (a, api) =>
      call(api, "POST", "/api/v1/transactions/category", {
        body: { id: a.id, category: null, merchant: a.all_from_merchant ?? false },
      }),
  },
];

const allowedTools = (scope: Scope) => TOOLS.filter((t) => scope === "write" || t.scope === "read");

export function toolList(scope: Scope) {
  return allowedTools(scope).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: {
      type: "object",
      properties: t.props,
      ...(t.required ? { required: t.required } : {}),
      additionalProperties: false,
    },
    ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
  }));
}

function toolResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

// Reads sync first when the data is stale. The route caps the wait; a failed
// sync must not fail the read, which then answers from the saved data.
async function syncIfStale(api: Api): Promise<SyncOutcome | null> {
  try {
    const res = await api("POST", "/api/v1/sync", { body: { if_stale: true } });
    return res.status === 200 ? (res.data as SyncOutcome) : null;
  } catch {
    return null;
  }
}

export async function callTool(name: string, rawArgs: unknown, scope: Scope, api: Api) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
  if (tool.scope === "write" && scope !== "write") {
    return toolResult({ error: `${name} needs a write-scoped Delta token; this one is read-only.` }, true);
  }
  let args: Args;
  try {
    args = validateArgs(tool.props, tool.required ?? [], rawArgs);
  } catch (err) {
    if (err instanceof ArgError) return toolResult({ error: err.message }, true);
    throw err;
  }
  try {
    const sync = tool.scope === "read" && name !== "sync" ? await syncIfStale(api) : null;
    const result = await tool.run(args, api);
    const status = (name === "get_status" ? result : await call(api, "GET", "/api/v1/status")) as Status;
    const synced = name === "sync" ? (result as SyncOutcome) : sync;
    return toolResult({ ...(result as Record<string, unknown>), as_of: asOf(status, todayISO(), synced) });
  } catch (err) {
    if (err instanceof ApiError) return toolResult({ error: err.message }, true);
    throw err;
  }
}

// ---------- JSON-RPC ----------

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

// One JSON-RPC message in, the response out (null for notifications and
// client responses, which get HTTP 202).
export async function handleRpc(msg: unknown, scope: Scope, api: Api): Promise<object | null> {
  const m = (msg && typeof msg === "object" && !Array.isArray(msg) ? msg : {}) as RpcMessage;
  const id = m.id ?? null;
  if (m.jsonrpc !== "2.0" || (typeof m.method !== "string" && m.id === undefined)) {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  }
  if (typeof m.method !== "string" || m.id === undefined) return null;
  try {
    return { jsonrpc: "2.0", id, result: await dispatch(m.method, m.params ?? {}, scope, api) };
  } catch (err) {
    if (err instanceof RpcError) return { jsonrpc: "2.0", id, error: { code: err.code, message: err.message } };
    throw err;
  }
}

// The settings route answers with defaults until the user saves their own;
// a failure here must not break initialize, so fall back to the defaults.
async function analysisSettings(api: Api): Promise<AnalysisSettings> {
  try {
    const res = await api("GET", "/api/v1/settings");
    return res.status === 200 ? withDefaults((res.data as { analysis?: unknown }).analysis) : ANALYSIS_DEFAULTS;
  } catch {
    return ANALYSIS_DEFAULTS;
  }
}

async function dispatch(method: string, params: Record<string, unknown>, scope: Scope, api: Api) {
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return {
        protocolVersion:
          typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...SERVER_INFO, title: "Delta personal finance" },
        instructions: instructions(await analysisSettings(api)),
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: toolList(scope) };
    case "tools/call":
      if (typeof params.name !== "string") throw new RpcError(-32602, "params.name must be a string");
      return callTool(params.name, params.arguments, scope, api);
    default:
      throw new RpcError(-32601, `Method not found: ${method}`);
  }
}
