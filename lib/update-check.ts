import "server-only";

// "Update available" pill (app/update-pill.tsx). The build bakes in the commit
// it was built from (DELTA_COMMIT, next.config.ts); this asks GitHub whether
// the latest release has commits that build lacks. Never blocks a page: callers get the last known
// answer (null until the first check lands), and a stale one refreshes in the
// background. Off with DELTA_UPDATE_CHECK=off; no commit known = no check.

const TTL = 12 * 3600e3;
const REPO = process.env.DELTA_UPDATE_REPO ?? "zeapsu/Delta";

export type UpdateStatus = { behindBy: number };

let cached: { at: number; status: UpdateStatus | null } | undefined;
let inFlight = false;

const github = (path: string) =>
  fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "delta-update-check" },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });

// Compare with the latest release, not main: main also moves for dependency
// bumps and docs, which made the pill show with no new version out. A build
// from main past the release is ahead of it, so it shows nothing. Homebrew's
// DELTA_COMMIT is its tag (e.g. v1.2.0), which compares the same way.
async function target(): Promise<string | null> {
  const res = await github("releases/latest");
  if (!res.ok) return null;
  const tag = ((await res.json()) as { tag_name?: unknown }).tag_name;
  return typeof tag === "string" ? tag : null;
}

async function check(commit: string): Promise<UpdateStatus | null> {
  const to = await target();
  if (!to) return null;
  const res = await github(`compare/${commit}...${to}`);
  if (!res.ok) return null; // unknown commit (local build, fork), rate limit, ...
  // compare/<build>...<target>: ahead_by = commits there the build doesn't have.
  const body = (await res.json()) as { ahead_by?: unknown };
  return typeof body.ahead_by === "number" && body.ahead_by > 0 ? { behindBy: body.ahead_by } : null;
}

export function updateStatus(): UpdateStatus | null {
  const commit = process.env.DELTA_COMMIT;
  if (!commit || process.env.DELTA_UPDATE_CHECK === "off") return null;
  if ((!cached || Date.now() - cached.at > TTL) && !inFlight) {
    inFlight = true;
    check(commit)
      .catch(() => null)
      .then((status) => {
        cached = { at: Date.now(), status };
        inFlight = false;
      });
  }
  return cached?.status ?? null;
}
