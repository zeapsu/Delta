#!/usr/bin/env bash
# Runs every documented query in skills/delta-finance read-only against the real DB
# and fails on SQL errors or token leakage. Usage: bash scripts/skill-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${DATABASE_PATH:-./delta.db}"
QUERIES=skills/delta-finance/references/queries.md

# The queries doc is the copy-paste surface: it must never touch the secret column.
if grep -qiE 'access_token|select \*' "$QUERIES"; then
  echo "FAIL: $QUERIES references access_token or uses SELECT *" >&2
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

awk -v dir="$tmp" '/^```sql/{f=1; n++; next} /^```/{f=0; next} f{print > (dir "/" n ".sql")}' "$QUERIES"

# ponytail: naive sed param substitution; fine until params grow beyond :month/:q
month=$(date +%Y-%m)
count=0
for f in "$tmp"/*.sql; do
  sed "s/:month/'$month'/g; s/:q/'%a%'/g" "$f" |
    sqlite3 -readonly "file:$DB?mode=ro" > "$tmp/out"
  if grep -q 'access-' "$tmp/out"; then
    echo "FAIL: query $f output contains a Plaid token" >&2
    exit 1
  fi
  count=$((count + 1))
done

echo "ok: $count queries ran clean against $DB"
