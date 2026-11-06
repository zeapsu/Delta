import { NextResponse, type NextRequest } from "next/server";
import { allowed, crossSiteWrite } from "@/lib/tailnet";
import { bearerToken, publicMcp, requiredScope, scopeAllows } from "@/lib/api-auth";
import { lookupToken } from "@/lib/api-tokens";

// Every API route sits behind the tailnet guard — the budgets, recurring and
// Plaid routes were once reachable without it. Writes
// also refuse cross-site browser requests: any web page open on a tailnet
// device could otherwise POST a text/plain body (no CORS preflight) to the
// Jetson, e.g. to delete budgets or trigger syncs. curl (the sync timer) and
// the agent send no Origin, so they pass.
//
// Inside the tailnet, /api/v1 (the agent API) also needs a per-client bearer
// token with the right scope (lib/api-auth.ts). Proxy runs on the Node.js
// runtime in Next 16, so it can read the token table directly.
//
// DELTA_PUBLIC_MCP=1 opens /api/v1/mcp alone to any network; it still needs a
// token (see publicMcp in lib/api-auth.ts).
export async function proxy(req: NextRequest) {
  if (!allowed(req) && !publicMcp(req.nextUrl.pathname)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (crossSiteWrite(req)) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }

  const auth = req.headers.get("authorization");
  const needed = requiredScope(req.nextUrl.pathname, req.method, auth !== null);
  if (needed) {
    const token = bearerToken(auth);
    const found = token ? await lookupToken(token) : null;
    if (!found) {
      return NextResponse.json(
        { error: "Missing or invalid API token" },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="delta"' } },
      );
    }
    if (!scopeAllows(found.scope, needed)) {
      return NextResponse.json({ error: `Token lacks ${needed} scope` }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
