import { NextResponse } from "next/server";
import { bearerToken, type Scope } from "@/lib/api-auth";
import { lookupToken } from "@/lib/api-tokens";
import { handleRpc, type Api, type ApiMethod } from "@/lib/mcp";
import * as accounts from "../accounts/route";
import * as budgets from "../budgets/route";
import * as cashFlow from "../cash-flow/route";
import * as investments from "../investments/route";
import * as netWorth from "../net-worth/route";
import * as recurring from "../recurring/route";
import * as settings from "../settings/route";
import * as spending from "../spending/route";
import * as status from "../status/route";
import * as sync from "../sync/route";
import * as transactions from "../transactions/route";
import * as transactionCategory from "../transactions/category/route";

export const dynamic = "force-dynamic";

// MCP endpoint (Streamable HTTP, stateless, JSON responses — no SSE stream or
// sessions). proxy.ts has already checked the bearer token with read scope;
// write tools need a write token, checked per call in lib/mcp.ts.
//
// The tools call the v1 route handlers in-process, so the MCP layer gets
// exactly the API's validation and numbers without reading the DB itself.
type Handler = (req: Request) => Promise<Response>;
const ROUTES: Record<string, Partial<Record<ApiMethod, Handler>>> = {
  "/api/v1/accounts": accounts,
  "/api/v1/budgets": budgets,
  "/api/v1/cash-flow": cashFlow,
  "/api/v1/investments": investments,
  "/api/v1/net-worth": netWorth,
  "/api/v1/recurring": recurring,
  "/api/v1/settings": settings,
  "/api/v1/spending": spending,
  "/api/v1/status": status,
  "/api/v1/sync": sync,
  "/api/v1/transactions": transactions,
  "/api/v1/transactions/category": transactionCategory,
};

const api: Api = async (method, path, opts = {}) => {
  const handler = ROUTES[path]?.[method];
  if (!handler) return { status: 404, data: { error: `no route ${method} ${path}` } };
  const url = new URL(path, "http://delta.internal");
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await handler(
    new Request(url, {
      method,
      ...(opts.body !== undefined
        ? { body: JSON.stringify(opts.body), headers: { "content-type": "application/json" } }
        : {}),
    }),
  );
  return { status: res.status, data: await res.json() };
};

const rpcError = (code: number, message: string, status = 400) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });

export async function POST(req: Request) {
  const token = bearerToken(req.headers.get("authorization"));
  const found = token ? await lookupToken(token) : null;
  if (!found) return rpcError(-32001, "Missing or invalid API token", 401);
  const scope: Scope = found.scope === "write" ? "write" : "read";

  let msg: unknown;
  try {
    msg = await req.json();
  } catch {
    return rpcError(-32700, "Parse error");
  }
  if (Array.isArray(msg)) return rpcError(-32600, "Batches are not supported");

  const reply = await handleRpc(msg, scope, api);
  return reply ? NextResponse.json(reply) : new Response(null, { status: 202 });
}

// No server-initiated stream: clients that probe with GET fall back to POST.
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
