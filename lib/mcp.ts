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
import type { Scope } from "@/lib/api-auth";

export const SERVER_INFO = { name: "delta", version: "1.0.0" };
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const STALE_DAYS = 3;

export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE";
export type Api = (
  method: ApiMethod,
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
) => Promise<{ status: number; data: unknown }>;

export const INSTRUCTIONS = `Delta is the user's personal finance app (bank data synced from Plaid). These tools read it through Delta's API.

Conventions:
- Money is in dollars (2 decimals). Transaction and investment amounts use the Plaid sign: positive = money out (spend), negative = money in (income, refunds).
- "Spend" excludes transfers between the user's own accounts (TRANSFER_IN/TRANSFER_OUT), INCOME and credit card payments (categoryDetailed LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: the card purchases are already counted), and includes uncategorized rows. Other LOAN_PAYMENTS (student, auto, mortgage) count as spend. Totals from spending_by_category, cash_flow and get_budgets are computed by Delta and match the dashboard: use them instead of adding up transactions yourself.
- Credit card and loan balances are positive amounts owed; net worth subtracts them.
- Pending transactions can still change or disappear.
- Categories are Plaid's automatic labels (e.g. FOOD_AND_DRINK) and can be wrong; list the transactions behind a surprising number before drawing conclusions.
- Recurring: "confirmed" rules are user-reviewed truth; "suggestions" are unreviewed guesses, never count them in totals.

Every answer has an as_of block. If it carries warnings (data older than ${STALE_DAYS} days, or a bank connection whose last sync failed), tell the user and caveat your conclusions with the last sync date.

Advice: ground every claim in numbers you just fetched. Budgeting, spending patterns, subscriptions and cash flow are in scope; no specific investment, securities, tax or legal advice. Only call a write tool (set_budget, recurring rules) after the user explicitly agrees. Never repeat the API token.`;

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
    if (!(key in args)) throw new ArgError(`missing required argument: ${key}`);
  }
  const out: Args = {};
  for (const [key, value] of Object.entries(args)) {
    const p = props[key];
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
  warnings: string[];
};

export function asOf(s: Status, today: string = new Date().toISOString().slice(0, 10)): AsOf {
  const warnings: string[] = [];
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
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
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
      "Bank and card transactions, newest first, paged. amount is dollars with positive = money out, negative = money in. Use this to find specific charges or to check the transactions behind a total; for totals use spending_by_category or cash_flow instead of adding these up. Investment buys/sells are not here (see investment_activity).",
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
      "Spend per category for one month, biggest first, in dollars: posted total and pendingTotal per category plus month totals. Uses Delta's spend rule (no transfers or income; refunds net within a category). Matches the dashboard's spending page.",
    scope: "read",
    props: { month: { ...MONTH, description: "YYYY-MM, default this month (partial)" } },
    annotations: READ_HINTS,
    run: read("/api/v1/spending", ["total", "pendingTotal"]),
  },
  {
    name: "cash_flow",
    title: "Monthly income vs spending",
    description:
      "Posted income and spending per month in dollars, oldest first. The current month is partial. Use for trends; call a trend real only with 3+ months of movement.",
    scope: "read",
    props: {
      months: { type: "integer", minimum: 1, maximum: 36, description: "How many months, default 6" },
      end: { ...MONTH, description: "Last month, YYYY-MM, default this month" },
    },
    annotations: READ_HINTS,
    run: read("/api/v1/cash-flow", ["income", "spending"]),
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
      "Recurring charges in dollars. confirmed = rules the user reviewed (the truth: cadence, last and next expected date; monthlyEstimate sums only these). suggestions = series Delta detected that the user has not reviewed yet; never count them in totals, but you can ask the user to confirm or dismiss them.",
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
    description: "Edit a confirmed recurring rule (id from get_recurring confirmed). Only after the user explicitly agrees.",
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
    const result = await tool.run(args, api);
    const status = (name === "get_status" ? result : await call(api, "GET", "/api/v1/status")) as Status;
    return toolResult({ ...(result as Record<string, unknown>), as_of: asOf(status) });
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

async function dispatch(method: string, params: Record<string, unknown>, scope: Scope, api: Api) {
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return {
        protocolVersion:
          typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...SERVER_INFO, title: "Delta personal finance" },
        instructions: INSTRUCTIONS,
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
