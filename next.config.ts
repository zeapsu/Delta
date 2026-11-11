import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// The commit this build came from, for the "Update available" pill
// (lib/update-check.ts). Docker builds have no .git, so they pass it in as the
// DELTA_COMMIT build arg; bare-metal builds read it from git.
function commit(): string {
  if (process.env.DELTA_COMMIT) return process.env.DELTA_COMMIT;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

// Sent with every response. Delta never needs to be framed, so refuse it
// (clickjacking: a page elsewhere could frame the dashboard and steer clicks
// onto Revoke or Delete), and keep page URLs, which carry filters and search
// terms, out of the Referer sent to other sites (Plaid Link's script).
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  env: { DELTA_COMMIT: commit() },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
