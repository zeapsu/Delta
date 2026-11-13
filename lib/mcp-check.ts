import assert from "node:assert";
import { asOf, cents, handleRpc, toDollars, toolList, validateArgs, type Api } from "./mcp";

// Fake API: records calls, answers like the v1 routes (cents).
const calls: { method: string; path: string; query?: unknown; body?: unknown }[] = [];
const today = new Date().toISOString().slice(0, 10);
let settingsReply: { status: number; data: unknown } | null = null;
let syncReply: { status: number; data: unknown } = { status: 200, data: { status: "fresh", next_sync_at: null } };
const api: Api = async (method, path, opts = {}) => {
  calls.push({ method, path, query: opts.query, body: opts.body });
  if (path === "/api/v1/status") {
    return {
      status: 200,
      data: {
        lastTransaction: today,
        lastSnapshot: today,
        lastInvestment: null,
        connections: [{ id: 1, institution: "Chase", lastSyncedAt: `${today}T06:00:00.000Z`, lastErrorCode: null }],
      },
    };
  }
  if (path === "/api/v1/settings" && settingsReply) return settingsReply;
  if (path === "/api/v1/sync") return syncReply;
  if (path === "/api/v1/spending") {
    return { status: 200, data: { month: "2026-10", total: 12345, pendingTotal: 500, categories: [{ category: "FOOD_AND_DRINK", total: 12345, pendingTotal: 500 }] } };
  }
  if (path === "/api/v1/transactions") {
    return { status: 200, data: { transactions: [{ id: 1, amount: -2500 }], total: 41, nextOffset: 1 } };
  }
  if (path === "/api/v1/budgets" && method === "POST") return { status: 200, data: { ok: true } };
  if (path === "/api/v1/transactions/category") return { status: 200, data: { ok: true, updated: 3 } };
  if (path === "/api/v1/budgets") return { status: 400, data: { error: "month must be YYYY-MM" } };
  return { status: 404, data: { error: "nope" } };
};
const rpc = (method: string, params?: object, scope: "read" | "write" = "read") =>
  handleRpc({ jsonrpc: "2.0", id: 1, method, params }, scope, api) as Promise<{
    result?: { protocolVersion?: string; instructions?: string; isError?: boolean; structuredContent?: Record<string, unknown> };
    error?: { code: number };
  }>;
const payload = (r: { result?: { structuredContent?: Record<string, unknown>; isError?: boolean } }) =>
  r.result!.structuredContent!;

async function main() {
  // initialize: echoes a supported version, falls back to the newest.
  let r = await rpc("initialize", { protocolVersion: "2025-06-18" });
  assert.strictEqual(r.result!.protocolVersion, "2025-06-18");
  r = await rpc("initialize", { protocolVersion: "1999-01-01" });
  assert.strictEqual(r.result!.protocolVersion, "2025-11-25");
  assert.match(r.result!.instructions!, /positive = money out/);
  // No settings route answer -> defaults; no placeholder left behind.
  assert.match(r.result!.instructions!, /at least 20% and \$50 above that average/);
  assert.doesNotMatch(r.result!.instructions!, /\{\{|undefined/);
  // The user's saved thresholds reach the instructions; bad keys fall back.
  settingsReply = {
    status: 200,
    data: { customized: true, analysis: { baselineMonths: 6, spikePct: 35, spikeMinDollars: 100, trendMonths: 4, budgetWarnPct: 9000 } },
  };
  r = await rpc("initialize", {});
  assert.match(r.result!.instructions!, /prior 6 months/);
  assert.match(r.result!.instructions!, /at least 35% and \$100 above/);
  assert.match(r.result!.instructions!, /4 months or more/);
  assert.match(r.result!.instructions!, /budget is 80% or more spent/);
  settingsReply = null;

  // Notifications get no response; unknown methods are -32601; junk is -32600.
  assert.strictEqual(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, "read", api), null);
  assert.strictEqual((await rpc("nope")).error!.code, -32601);
  assert.strictEqual(((await handleRpc("junk", "read", api)) as { error: { code: number } }).error.code, -32600);

  // tools/list: write tools only for write tokens; schemas are closed.
  const names = (s: "read" | "write") => toolList(s).map((t) => t.name);
  assert(!names("read").includes("set_budget"));
  assert(names("write").includes("set_budget"));
  assert(toolList("read").every((t) => t.inputSchema.additionalProperties === false));

  // A read tool: cents -> dollars, plus an as_of block.
  let c = await rpc("tools/call", { name: "spending_by_category", arguments: { month: "2026-10" } });
  let p = payload(c);
  assert.strictEqual(p.total, 123.45);
  assert.deepStrictEqual(p.categories, [{ category: "FOOD_AND_DRINK", total: 123.45, pendingTotal: 5 }]);
  assert.deepStrictEqual((p.as_of as { warnings: string[] }).warnings, []);
  // date_basis passes through to the API; anything but posted/authorized is refused.
  await rpc("tools/call", { name: "spending_by_category", arguments: { month: "2026-10", date_basis: "authorized" } });
  assert.deepStrictEqual(calls.findLast((x) => x.path === "/api/v1/spending")!.query, { month: "2026-10", date_basis: "authorized" });
  c = await rpc("tools/call", { name: "spending_by_category", arguments: { date_basis: "purchase" } });
  assert.strictEqual(c.result!.isError, true);

  // Paged tools: amount converted, row count NOT converted, renamed.
  c = await rpc("tools/call", { name: "search_transactions", arguments: { pending: false, limit: 1 } });
  p = payload(c);
  assert.deepStrictEqual(p.transactions, [{ id: 1, amount: -25 }]);
  assert.strictEqual(p.total_count, 41);
  assert.strictEqual(p.next_offset, 1);
  assert.deepStrictEqual(calls.find((x) => x.path === "/api/v1/transactions")!.query, { pending: false, limit: 1 });

  // Strict args: unknown key, wrong type, bool-for-int, bad pattern -> tool error, no API call.
  for (const args of [{ bogus: 1 }, { limit: "5" }, { limit: true }, { limit: 1.5 }, { month: "2026-13" }, { limit: 501 }]) {
    const before = calls.length;
    c = await rpc("tools/call", { name: "search_transactions", arguments: args });
    assert.strictEqual(c.result!.isError, true, JSON.stringify(args));
    assert.strictEqual(calls.length, before); // rejected before reaching the API
  }
  assert.throws(() => validateArgs({}, ["x"], {}), /missing required/);

  // API errors surface as tool errors with the API's message.
  c = await rpc("tools/call", { name: "get_budgets", arguments: {} });
  assert.match(String(payload(c).error), /400: month must be/);

  // Writes: refused for read tokens; dollars -> cents for write tokens.
  c = await rpc("tools/call", { name: "set_budget", arguments: { category: "FOOD_AND_DRINK", monthly_amount: 400.1 } });
  assert.strictEqual(c.result!.isError, true);
  c = await rpc("tools/call", { name: "set_budget", arguments: { category: "FOOD_AND_DRINK", monthly_amount: 400.1 } }, "write");
  assert.strictEqual(payload(c).ok, true);
  assert.deepStrictEqual(calls.findLast((x) => x.method === "POST")!.body, { category: "FOOD_AND_DRINK", monthlyAmount: 40010 });
  // Relabels: write-only; merchant flag defaults to false; reset sends null; categories are an enum.
  assert(!names("read").includes("set_transaction_category"));
  c = await rpc("tools/call", { name: "set_transaction_category", arguments: { id: 7, category: "FOOD_AND_DRINK" } }, "write");
  assert.strictEqual(payload(c).updated, 3);
  assert.deepStrictEqual(calls.findLast((x) => x.path === "/api/v1/transactions/category")!.body, { id: 7, category: "FOOD_AND_DRINK", merchant: false });
  await rpc("tools/call", { name: "reset_transaction_category", arguments: { id: 7, all_from_merchant: true } }, "write");
  assert.deepStrictEqual(calls.findLast((x) => x.path === "/api/v1/transactions/category")!.body, { id: 7, category: null, merchant: true });
  const before = calls.length;
  c = await rpc("tools/call", { name: "set_transaction_category", arguments: { id: 7, category: "TACOS" } }, "write");
  assert.strictEqual(c.result!.isError, true);
  assert.strictEqual(calls.length, before); // rejected before reaching the API
  assert.strictEqual((await rpc("tools/call", { name: "drop_tables" })).error!.code, -32602);

  // Reads sync first when stale (if_stale); writes don't.
  calls.length = 0;
  await rpc("tools/call", { name: "list_accounts", arguments: {} });
  assert.deepStrictEqual(calls[0], { method: "POST", path: "/api/v1/sync", query: undefined, body: { if_stale: true } });
  calls.length = 0;
  await rpc("tools/call", { name: "set_budget", arguments: { category: "FOOD_AND_DRINK", monthly_amount: 1 } }, "write");
  assert(!calls.some((x) => x.path === "/api/v1/sync"));
  // as_of says whether this answer synced, and when refreshed transactions land.
  syncReply = { status: 200, data: { status: "synced", next_sync_at: "2026-10-28T12:03:00.000Z" } };
  let a = payload(await rpc("tools/call", { name: "spending_by_category", arguments: {} })).as_of as Record<string, unknown>;
  assert.strictEqual(a.synced_now, true);
  assert.strictEqual(a.next_sync, "2026-10-28T12:03:00.000Z");
  syncReply = { status: 200, data: { status: "running", next_sync_at: null } };
  a = payload(await rpc("tools/call", { name: "spending_by_category", arguments: {} })).as_of as Record<string, unknown>;
  assert.strictEqual(a.synced_now, false);
  assert(!("next_sync" in a));
  assert.match((a.warnings as string[])[0], /still running/);
  // A failed sync doesn't fail the read.
  syncReply = { status: 500, data: { error: "sync failed" } };
  c = await rpc("tools/call", { name: "spending_by_category", arguments: {} });
  assert.strictEqual(payload(c).total, 123.45);
  // The sync tool: read scope, no if_stale, result counts flattened.
  assert(names("read").includes("sync"));
  syncReply = { status: 200, data: { status: "synced", result: { added: 3, modified: 1, removed: 0, investments: 0, errors: [] }, next_sync_at: null } };
  calls.length = 0;
  p = payload(await rpc("tools/call", { name: "sync", arguments: {} }));
  assert.deepStrictEqual(calls.filter((x) => x.path === "/api/v1/sync"), [{ method: "POST", path: "/api/v1/sync", query: undefined, body: undefined }]);
  assert.strictEqual(p.status, "synced");
  assert.strictEqual(p.added, 3);
  syncReply = { status: 200, data: { status: "fresh", next_sync_at: null } };

  // Helpers.
  assert.strictEqual(cents(19.99), 1999);
  assert.deepStrictEqual(toDollars({ a: [{ amount: 150 }], amount: null, n: 3 }, new Set(["amount"])), { a: [{ amount: 1.5 }], amount: null, n: 3 });
  const conn = { id: 2, institution: "Amex", lastSyncedAt: "2026-10-20T00:00:00.000Z", lastErrorCode: "ITEM_LOGIN_REQUIRED" };
  const old = asOf({ lastTransaction: "2026-10-20", lastSnapshot: "2026-10-21", lastInvestment: null, connections: [conn] }, "2026-10-28");
  assert.strictEqual(old.warnings.length, 2);
  assert.match(old.warnings[0], /2026-10-21 \(7 days ago\)/);
  assert.match(old.warnings[1], /Amex: last sync failed \(ITEM_LOGIN_REQUIRED\)/);
  assert.strictEqual(old.last_sync, "2026-10-20T00:00:00.000Z");
  assert.deepStrictEqual(asOf({ lastTransaction: null, lastSnapshot: null, lastInvestment: null, connections: [] }).warnings, ["No synced data yet."]);

  // Inherited names are not arguments: no prototype key passes as "known".
for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
  assert.throws(() => validateArgs({ id: { type: "integer" as const, description: "" } }, [], JSON.parse(`{"${key}": 1}`)), /unknown argument/, key);
}
assert.throws(() => validateArgs({ toString: { type: "string" as const, description: "" } }, ["toString"], {}), /missing required/);

console.log("lib/mcp-check.ts: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
