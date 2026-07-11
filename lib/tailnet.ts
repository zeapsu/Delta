// ponytail: the tailnet is the real trust boundary (no route in this app has
// auth); this guard refuses first-hop addresses outside loopback and the
// tailscale CGNAT range (100.64.0.0/10). Next.js fills x-forwarded-for with
// the real peer when the client sends none (verified), but a client-supplied
// header wins — spoofable by anyone who can already reach the port. M6 closes
// that by binding the server to the tailscale interface.
export function allowed(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  const m = ip.match(/^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/);
  return m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

// Active bridge turns by conversationId: runHermes registers a stopper,
// /api/chat/stop invokes it (#55). Client disconnect no longer interrupts
// (#54), so an explicit Stop needs this side channel.
// ponytail: module-level map — single process, single user; revisit if the
// app ever runs multi-instance.
export const activeTurns = new Map<number, () => void>();
