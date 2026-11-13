#!/usr/bin/env bash
# Install or refresh Delta's systemd units (running without Docker): the app,
# a sync every 6 hours and a daily backup. Idempotent; run with sudo.
# Precondition: npm ci && npm run build already run in the repo, .env present.
#
# The unit files here are templates. This fills in their @...@ values:
#   user  DELTA_USER, default: the owner of this checkout
#   node  DELTA_NODE, default: that user's `node`
#   bind  DELTA_BIND, default: this machine's Tailscale IPv4 address
# For example: sudo DELTA_BIND=192.168.1.20 deploy/install.sh
# `deploy/install.sh --print` shows the filled-in units and installs nothing.
set -euo pipefail
cd "$(dirname "$0")"
repo=$(cd .. && pwd)
units=(delta.service delta-backup.service delta-backup.timer delta-sync.service delta-sync.timer)
die() { echo "$*" >&2; exit 1; }

user=${DELTA_USER:-$(stat -c %U "$repo")}
# The user's own shell finds a node installed with nvm; root's PATH does not.
as_user() { if [ "$(id -un)" = "$user" ]; then "$@"; else sudo -H -u "$user" "$@"; fi; }
node=${DELTA_NODE:-$(as_user bash -ic 'command -v node' 2>/dev/null | tail -n 1 || true)}
bind=${DELTA_BIND:-$(tailscale ip -4 2>/dev/null | head -n 1 || true)}

[ -x "$node" ] || die "Can't find node for $user. Run again with DELTA_NODE=/path/to/node."
[ -n "$bind" ] || die "No Tailscale address found. Run again with DELTA_BIND=<address to listen on>."
case "$user$repo$node$bind" in
  *[[:space:]\|]*) die "The user, paths and address can't contain spaces or '|'." ;;
esac

render() {
  sed -e "s|@USER@|$user|g" -e "s|@REPO@|$repo|g" -e "s|@NODE_DIR@|$(dirname "$node")|g" \
    -e "s|@NODE@|$node|g" -e "s|@BIND@|$bind|g" "$1"
}

if [ "${1:-}" = "--print" ]; then
  for u in "${units[@]}"; do echo "# --- $u"; render "$u"; done
  exit 0
fi

for u in "${units[@]}"; do render "$u" > "/etc/systemd/system/$u"; done
systemctl daemon-reload
systemctl enable --now delta.service delta-backup.timer delta-sync.timer
systemctl restart delta.service
# status is informational; exits non-zero if a unit isn't active yet
systemctl --no-pager status delta.service delta-backup.timer delta-sync.timer || true
