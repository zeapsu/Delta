// ponytail: the tailnet is the real trust boundary (no route in this app has
// auth); this guard refuses first-hop addresses outside loopback and the
// tailscale CGNAT range (100.64.0.0/10). Next.js fills x-forwarded-for with
// the real peer when the client sends none (verified), but a client-supplied
// header wins — spoofable by anyone who can already reach the port. M6 closes
// that by binding the server to the tailscale interface. Applied to every
// /api route by proxy.ts.
export function allowed(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  const m = ip.match(/^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/);
  return m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF guard: a state-changing request a browser sent from another site.
// Sec-Fetch-Site is set by every current browser and can't be forged by page
// script; Origin vs Host covers older ones. Non-browser clients send neither.
export function crossSiteWrite(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true; // "null" or garbage Origin
  }
}

// Active chat turns by conversationId: the agent backend registers a stopper,
// /api/chat/stop invokes it (#55). Empty until #58 adds a backend. Client disconnect no longer interrupts
// (#54), so an explicit Stop needs this side channel.
// ponytail: module-level map — single process, single user; revisit if the
// app ever runs multi-instance.
export const activeTurns = new Map<number, () => void>();
