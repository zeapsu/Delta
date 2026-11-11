// Web UI login, the pure part (self-check: login-check.ts). One password for
// the single user, opt-in: with none set, Delta stays open to its network as
// before. Stored as the `login` settings row: an scrypt hash plus the secret
// that signs session cookies, so changing the password logs out every device.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const LOGIN_KEY = "login";
export const SESSION_COOKIE = "delta_session";
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export type StoredLogin = { hash: string; secret: string };

// scrypt N=2^15, r=8, p=1: ~50ms, the OWASP minimum. Needs 32 MiB, over
// Node's default maxmem, hence the explicit limit.
const N = 32768, R = 8, P = 1, LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, r, p, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = scryptSync(password, Buffer.from(salt, "base64url"), want.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(got, want);
}

export function newLogin(password: string): StoredLogin {
  return { hash: hashPassword(password), secret: randomBytes(32).toString("base64url") };
}

export function parseStoredLogin(value: string | undefined): StoredLogin | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value);
    return typeof v?.hash === "string" && typeof v?.secret === "string" ? { hash: v.hash, secret: v.secret } : null;
  } catch {
    return null;
  }
}

export function checkNewPassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password required";
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`;
  if (password.length > MAX_PASSWORD) return "Too long";
  return null;
}

// Session cookie: "<expiry ms>.<HMAC of it>". Stateless; the secret rotates
// with the password.
function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sessionValue(secret: string, now = Date.now()): string {
  const exp = String(now + SESSION_DAYS * 86_400_000);
  return `${exp}.${sign(secret, exp)}`;
}

export function validSession(secret: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, mac] = value.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  const want = Buffer.from(sign(secret, exp));
  const got = Buffer.from(mac);
  return got.length === want.length && timingSafeEqual(got, want);
}

// What a request needs once a password is set:
// - "open": the login page/route, and the sync timer's two POSTs (they only
//   start a Plaid pull; the jobs container and systemd timer send no cookie);
// - "token": /api/v1, which keeps its bearer tokens (proxy.ts), no cookie;
// - "api" / "page": a session cookie, else 401 / redirect to /login.
export type Gate = "open" | "token" | "api" | "page";
const OPEN_POSTS = new Set(["/api/auth/login", "/api/auth/logout", "/api/plaid/sync", "/api/plaid/refresh"]);

export function gate(pathname: string, method: string): Gate {
  if (pathname === "/login") return "open";
  if (method === "POST" && OPEN_POSTS.has(pathname)) return "open";
  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) return "token";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  return "page";
}

// Where to go after logging in: a same-site path only, never "//evil.com".
// Printable ASCII only and no backslash: browsers drop tabs and newlines from
// a URL and read "\" as "/", so "/\t/evil.com" would leave the site too.
const NEXT_RE = /^\/[\x21-\x5b\x5d-\x7e]*$/;
const ORIGIN = "http://delta.invalid";

export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !NEXT_RE.test(next) || next.startsWith("//") || next.startsWith("/login")) {
    return "/";
  }
  try {
    if (new URL(next, ORIGIN).origin !== ORIGIN) return "/";
  } catch {
    return "/";
  }
  return next;
}

// Login attempts: 10 failures from one client address lock that address out
// for 15 minutes, and 50 failures overall lock everyone out for the rest of
// the window. The address comes from X-Forwarded-For, which a client can set
// (lib/tailnet.ts), so the overall count is what actually caps guessing; a
// device that is already logged in is unaffected.
type Fails = { n: number; until: number };

export class Throttle {
  private fails = new Map<string, Fails>();
  private all: Fails = { n: 0, until: 0 };
  constructor(
    private max = 10,
    private windowMs = 15 * 60_000,
    private maxAll = 50,
    private maxKeys = 5000,
  ) {}
  blocked(key: string, now = Date.now()): boolean {
    if (this.all.until > now && this.all.n >= this.maxAll) return true;
    const f = this.fails.get(key);
    if (!f) return false;
    if (f.until <= now) {
      this.fails.delete(key);
      return false;
    }
    return f.n >= this.max;
  }
  fail(key: string, now = Date.now()) {
    if (this.all.until <= now) this.all = { n: 1, until: now + this.windowMs };
    else this.all.n++;
    const f = this.fails.get(key);
    if (f && f.until > now) {
      f.n++;
      return;
    }
    // Made-up addresses must not grow the map without bound.
    if (this.fails.size >= this.maxKeys) {
      for (const [k, v] of this.fails) if (v.until <= now) this.fails.delete(k);
      if (this.fails.size >= this.maxKeys) this.fails.clear();
    }
    this.fails.set(key, { n: 1, until: now + this.windowMs });
  }
  // A successful login clears that address only, never the overall count.
  clear(key: string) {
    this.fails.delete(key);
  }
  get size(): number {
    return this.fails.size;
  }
}
