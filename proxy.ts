import { NextResponse, type NextRequest } from "next/server";
import { allowed, crossSiteWrite } from "@/lib/tailnet";
import { bearerToken, requiredScope, scopeAllows } from "@/lib/api-auth";
import { lookupToken } from "@/lib/api-tokens";
import { gate, SESSION_COOKIE, validSession } from "@/lib/login";
import { getLogin } from "@/lib/login-store";

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
// Once a password is set (Settings → You, lib/login.ts), pages and the
// dashboard's own API routes also need the session cookie; /api/v1 keeps
// using its tokens, and the sync timer's POSTs stay open (gate()).
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/")) return loginGate(req, gate(path, req.method));

  if (!allowed(req)) {
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
  return loginGate(req, gate(path, req.method));
}

function loginGate(req: NextRequest, g: ReturnType<typeof gate>) {
  if (g === "open" || g === "token") return NextResponse.next();
  const login = getLogin();
  if (!login || validSession(login.secret, req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (g === "api") return NextResponse.json({ error: "Log in to Delta first" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

// Everything but build assets and files with an extension (favicon etc.).
export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-z0-9]+$).*)"],
};
