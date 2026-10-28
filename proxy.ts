import { NextResponse, type NextRequest } from "next/server";
import { allowed, crossSiteWrite } from "@/lib/tailnet";

// Every API route sits behind the tailnet guard, not just chat — the budgets,
// recurring, conversations and Plaid routes were reachable without it. Writes
// also refuse cross-site browser requests: any web page open on a tailnet
// device could otherwise POST a text/plain body (no CORS preflight) to the
// Jetson, e.g. to delete budgets or trigger syncs. curl (the sync timer) and
// the agent send no Origin, so they pass.
export function proxy(req: NextRequest) {
  if (!allowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (crossSiteWrite(req)) {
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
