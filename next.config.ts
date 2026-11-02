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

const nextConfig: NextConfig = {
  env: { DELTA_COMMIT: commit() },
};

export default nextConfig;
