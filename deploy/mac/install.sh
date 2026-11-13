#!/bin/sh
# Install the daily backup-pull launchd agent on this Mac.
#   deploy/mac/install.sh <user@host:path/to/backups>
# The argument is where the server keeps its backups, as an rsync path, for
# example me@my-server:Delta/backups. It is saved in deploy/mac/backup-source
# (gitignored), so later runs can leave it out.
# Precondition: passwordless ssh to that server.
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_FILE="$REPO/deploy/mac/backup-source"
LOG="$HOME/Library/Logs/delta-backup-pull.log"
PLIST="$HOME/Library/LaunchAgents/com.delta.backup-pull.plist"

if [ -n "${1:-}" ]; then
  printf '%s\n' "$1" > "$SOURCE_FILE"
elif [ ! -s "$SOURCE_FILE" ]; then
  echo "Usage: deploy/mac/install.sh <user@host:path/to/backups>" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|REPO_PATH|$REPO|" -e "s|LOG_PATH|$LOG|" \
  "$REPO/deploy/mac/com.delta.backup-pull.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. Test with: launchctl start com.delta.backup-pull && tail $LOG"
