#!/usr/bin/env bash
# The fast checks CI's Checks job runs, for before a push or PR (about 30s).
# Usage: scripts/checks.sh   Exits non-zero at the first failure.
# The Claude Code hook in .claude/settings.json runs it before git push and PR
# creation. E2E, the Docker build and the docs build stay in CI and the verify skill.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }
step "Lint" && npm run --silent lint
step "Types" && npx tsc --noEmit
step "Self-checks" && npm test --silent
step "Self-checks at UTC+14 and UTC-11" && TZ=Pacific/Kiritimati npm test --silent && TZ=Pacific/Pago_Pago npm test --silent
step "DB smoke test" && npx tsx db/check.ts
step "Migrations match the schema"
before=$(git status --porcelain drizzle)
npx drizzle-kit generate >/dev/null
if [ "$(git status --porcelain drizzle)" != "$before" ]; then
  echo "db/schema.ts changed without a migration: commit the drizzle/ files drizzle-kit just generated." >&2
  exit 1
fi
echo "All checks passed."
