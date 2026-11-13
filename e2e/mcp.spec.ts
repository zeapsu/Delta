import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "@playwright/test";
import { bearer, SPEND_THIS_MONTH_CENTS, THIS_MONTH, tokens } from "./helpers";

// Drives /api/v1/mcp with the official MCP client SDK, the way an agent
// connects: initialize handshake, tools/list, tools/call.
async function connect(baseURL: string, token: string) {
  const client = new Client({ name: "delta-e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/api/v1/mcp", baseURL), {
    requestInit: { headers: bearer(token) },
  });
  await client.connect(transport);
  return client;
}

type CallResult = { isError?: boolean; structuredContent?: Record<string, unknown> };

test("handshake and tool listing by scope", async ({ baseURL }) => {
  const read = await connect(baseURL!, tokens().read);
  expect(read.getServerVersion()?.name).toBe("delta");
  expect(read.getInstructions()).toMatch(/positive = money out/);
  const readTools = (await read.listTools()).tools.map((t) => t.name);
  expect(readTools).toEqual(expect.arrayContaining(["get_status", "list_accounts", "spending_by_category", "search_transactions"]));
  expect(readTools).not.toContain("set_budget");
  await read.close();

  const write = await connect(baseURL!, tokens().write);
  const writeTools = (await write.listTools()).tools.map((t) => t.name);
  expect(writeTools).toEqual(expect.arrayContaining(["set_budget", "set_transaction_category"]));
  await write.close();
});

test("initialize carries the user's analysis thresholds", async ({ baseURL, request }) => {
  const watchful = { baselineMonths: 3, spikePct: 10, spikeMinDollars: 25, trendMonths: 2, budgetWarnPct: 70 };
  expect((await request.put("/api/settings", { data: { analysis: watchful } })).ok()).toBe(true);
  try {
    const client = await connect(baseURL!, tokens().read);
    expect(client.getInstructions()).toContain("at least 10% and $25 above that average");
    expect(client.getInstructions()).toContain("budget is 70% or more spent");
    await client.close();
  } finally {
    await request.put("/api/settings", {
      data: { analysis: { baselineMonths: 3, spikePct: 20, spikeMinDollars: 50, trendMonths: 3, budgetWarnPct: 80 } },
    });
  }
});

test("a bad token cannot connect", async ({ baseURL }) => {
  await expect(connect(baseURL!, "dlt_" + "x".repeat(43))).rejects.toThrow();
});

test("read tools return dollars from the synced data", async ({ baseURL }) => {
  const client = await connect(baseURL!, tokens().read);
  const spend = (await client.callTool({ name: "spending_by_category", arguments: { month: THIS_MONTH } })) as CallResult;
  expect(spend.isError).toBeFalsy();
  expect(spend.structuredContent!.total).toBeCloseTo(SPEND_THIS_MONTH_CENTS / 100, 2);
  expect(spend.structuredContent!.as_of).toBeTruthy();

  const accounts = (await client.callTool({ name: "list_accounts", arguments: {} })) as CallResult;
  expect(JSON.stringify(accounts.structuredContent)).toContain("Everyday Checking");

  const status = (await client.callTool({ name: "get_status", arguments: {} })) as CallResult;
  expect(status.isError).toBeFalsy();

  // Bad arguments come back as a tool error, not a crash.
  const bad = (await client.callTool({ name: "spending_by_category", arguments: { month: "nope" } })) as CallResult;
  expect(bad.isError).toBe(true);
  await client.close();
});

test("write tools: refused for read tokens, applied for write tokens", async ({ baseURL, request }) => {
  const read = await connect(baseURL!, tokens().read);
  const refused = (await read.callTool({ name: "set_budget", arguments: { category: "FOOD_AND_DRINK", monthly_amount: 300 } })) as CallResult;
  expect(refused.isError).toBe(true);
  await read.close();

  const write = await connect(baseURL!, tokens().write);
  const ok = (await write.callTool({ name: "set_budget", arguments: { category: "FOOD_AND_DRINK", monthly_amount: 300 } })) as CallResult;
  expect(ok.isError).toBeFalsy();
  const { budgets } = await (await request.get("/api/v1/budgets", { headers: bearer(tokens().read) })).json();
  expect(JSON.stringify(budgets)).toContain("FOOD_AND_DRINK");

  const del = (await write.callTool({ name: "delete_budget", arguments: { category: "FOOD_AND_DRINK" } })) as CallResult;
  expect(del.isError).toBeFalsy();
  await write.close();
});

test("sync: read tokens may sync, reads sync only when stale, re-checks are throttled", async ({ baseURL, request }) => {
  const h = bearer(tokens().read);
  // Setup synced moments ago, so a stale-only sync does nothing.
  const stale = await request.post("/api/v1/sync", { headers: h, data: { if_stale: true } });
  expect(stale.status()).toBe(200);
  expect((await stale.json()).status).toBe("fresh");
  expect((await request.post("/api/v1/sync", { headers: h, data: { if_stale: "yes" } })).status()).toBe(400);

  const client = await connect(baseURL!, tokens().read);
  expect((await client.listTools()).tools.map((t) => t.name)).toContain("sync");
  const accounts = (await client.callTool({ name: "list_accounts", arguments: {} })) as CallResult;
  expect((accounts.structuredContent!.as_of as { synced_now: boolean }).synced_now).toBe(false);

  // The banks were just asked to re-check (as the sync timer does), so an
  // explicit sync is throttled. The synced path is in lib/fresh-sync-check.ts:
  // this process can't forget a refresh within one run.
  expect((await request.post("/api/plaid/refresh")).status()).toBe(200);
  const synced = (await client.callTool({ name: "sync", arguments: {} })) as CallResult;
  expect(synced.isError).toBeFalsy();
  expect(synced.structuredContent!.status).toBe("throttled");
  await client.close();
  const again = await request.post("/api/v1/sync", { headers: h });
  expect(again.status()).toBe(200);
  expect((await again.json()).status).toBe("throttled");
});
