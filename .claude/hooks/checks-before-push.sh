#!/usr/bin/env bash
# PreToolUse hook (.claude/settings.json): before an agent pushes or opens a
# PR, run scripts/checks.sh and block the call if a check fails. Other tool
# calls pass straight through.
set -uo pipefail
input=$(cat)
# Cheap exit for the many tool calls that aren't a push or a PR.
printf '%s' "$input" | grep -Eq 'git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create|create_pull_request' || exit 0
tool=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.tool_name??"")})')
cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.tool_input?.command??"")})')

case "$tool" in
  Bash) printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)' || exit 0 ;;
  *create_pull_request*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(scripts/checks.sh 2>&1); then
  printf '%s\n' "$out" | tail -40 >&2
  echo "Blocked: fix the failing check above before pushing or opening a PR (AGENTS.md: after three failed rounds, stop and ask)." >&2
  exit 2
fi
exit 0
