// Pure token policy for /api routes, no DB imports — see lib/api-auth-check.ts.
// The tailnet stays the outer boundary (lib/tailnet.ts); per-client tokens are
// the inner one. /api/v1 is the token-only agent API. The older routes keep
// serving the dashboard (same-origin browser, no token) and the sync timer,
// but a request that does carry a token gets it checked there too.
import { createHash, randomBytes } from "node:crypto";

export type Scope = "read" | "write";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN_RE = /^dlt_[A-Za-z0-9_-]{43}$/;

export function newToken(): string {
  return `dlt_${randomBytes(32).toString("base64url")}`;
}

// Tokens are 256 random bits, so a plain sha256 is enough (no slow hash needed).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 8);
}

// The MCP endpoint carries every JSON-RPC call, reads included, as a POST; its
// write tools check for write scope themselves (lib/mcp.ts).
export const MCP_PATH = "/api/v1/mcp";

// DELTA_PUBLIC_MCP=1 lets the MCP endpoint, and only that exact path, through
// the network guard, for agents that call from the internet (e.g. through
// Tailscale Funnel scoped to this path). The bearer token is then the only gate,
// so requiredScope() still demands one. Off by default.
export function publicMcp(pathname: string, flag = process.env.DELTA_PUBLIC_MCP): boolean {
  return flag === "1" && pathname === MCP_PATH;
}

export function isV1(pathname: string): boolean {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

// The scope a request needs, or null when it may go through without a token.
export function requiredScope(pathname: string, method: string, hasAuth: boolean): Scope | null {
  if (!isV1(pathname) && !hasAuth) return null;
  if (pathname === MCP_PATH) return "read";
  return SAFE_METHODS.has(method) ? "read" : "write";
}

// "Authorization: Bearer dlt_..." -> the token; undefined when absent;
// null when present but malformed.
export function bearerToken(header: string | null): string | null | undefined {
  if (header === null) return undefined;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

export function scopeAllows(granted: string, needed: Scope): boolean {
  return needed === "read" ? granted === "read" || granted === "write" : granted === "write";
}
