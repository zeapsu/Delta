// ponytail: the network is the real trust boundary (the optional web UI
// password, lib/login.ts, is a second lock); this guard refuses first-hop addresses outside loopback and the
// allowed networks: DELTA_ALLOWED_NETWORKS, comma-separated IPv4 CIDRs,
// default the tailscale CGNAT range 100.64.0.0/10. Next.js fills
// x-forwarded-for with the real peer when the client sends none (verified),
// but a client-supplied header wins — spoofable by anyone who can already
// reach the port, so bind the server (or the Docker port) to the private
// interface only. Applied to every /api route by proxy.ts.
const DEFAULT_NETWORKS = "100.64.0.0/10";

function ipv4(s: string): number | null {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function parseNetworks(spec: string): { base: number; mask: number }[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((cidr) => {
      const [addr, bits = "32"] = cidr.split("/");
      const base = ipv4(addr);
      const n = Number(bits);
      if (base === null || !Number.isInteger(n) || n < 0 || n > 32) {
        throw new Error(`DELTA_ALLOWED_NETWORKS: bad CIDR "${cidr}"`);
      }
      const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
      return { base: (base & mask) >>> 0, mask };
    });
}

let cached: { spec: string; nets: ReturnType<typeof parseNetworks> } | undefined;

export function allowed(req: Request, spec = process.env.DELTA_ALLOWED_NETWORKS || DEFAULT_NETWORKS): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    return true;
  }
  if (cached?.spec !== spec) cached = { spec, nets: parseNetworks(spec) };
  const addr = ipv4(ip.replace(/^::ffff:/, ""));
  return addr !== null && cached.nets.some((n) => ((addr & n.mask) >>> 0) === n.base);
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

// DNS rebinding guard. A web page on any site can point its own domain at
// Delta's private address and then read Delta "same-origin" through the
// visitor's browser: the request comes from an allowed device, so the network
// check passes, and with no password set nothing else asks who is calling.
// The one thing the page can't choose is the name: the browser still sends
// Host: <the attacker's domain>. So a request must name Delta the way its
// owner would reach it:
//   - an IP address (rebinding needs a DNS name),
//   - localhost, a single-label name ("jetson", "umbrel"),
//   - names public DNS can't serve (.local, .lan, .home, .home.arpa,
//     .internal, .localhost, .onion) and Tailscale's (.ts.net),
//   - DELTA_URL's host, and anything in DELTA_ALLOWED_HOSTS (comma-separated
//     names; "*.example.com" covers subdomains; "*" turns the check off).
// A reverse proxy that rewrites Host passes the original as X-Forwarded-Host,
// so that is held to the same rule.
const PRIVATE_SUFFIXES = [".localhost", ".local", ".lan", ".home", ".home.arpa", ".internal", ".onion", ".ts.net"];

// "Example.com:3000" -> "example.com", "[::1]:3000" -> "[::1]".
function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.replace(/:\d+$/, "").replace(/\.$/, "");
}

function nameAllowed(name: string, extra: string[]): boolean {
  if (name === "") return true; // no Host at all: not a browser
  if (name.startsWith("[") || ipv4(name) !== null) return true;
  if (!/^[a-z0-9._-]+$/.test(name)) return false;
  if (!name.includes(".") || PRIVATE_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return extra.some((e) => (e.startsWith("*.") ? name.endsWith(e.slice(1)) : name === e));
}

export function knownHost(
  req: Request,
  spec = process.env.DELTA_ALLOWED_HOSTS ?? "",
  deltaUrl = process.env.DELTA_URL ?? "",
): boolean {
  const extra = spec.split(",").map(hostName).filter(Boolean);
  if (extra.includes("*")) return true;
  try {
    if (deltaUrl) extra.push(hostName(new URL(deltaUrl).host));
  } catch {
    // A malformed DELTA_URL allows nothing extra.
  }
  const forwarded = (req.headers.get("x-forwarded-host") ?? "").split(",")[0];
  return [req.headers.get("host") ?? "", forwarded].every((h) => nameAllowed(hostName(h), extra));
}

// The name to show in the refusal, safe to print.
export function shownHost(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-host") ?? "").split(",")[0];
  return hostName(forwarded || (req.headers.get("host") ?? "")).replace(/[^a-z0-9.:[\]_-]/g, "").slice(0, 100);
}
