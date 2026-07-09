#!/bin/sh
# Install the daily backup-pull launchd agent on this Mac.
# Precondition: passwordless ssh to zeapsu@100.116.56.85.
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$HOME/Library/Logs/delta-backup-pull.log"
PLIST="$HOME/Library/LaunchAgents/com.delta.backup-pull.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|REPO_PATH|$REPO|" -e "s|LOG_PATH|$LOG|" \
  "$REPO/deploy/mac/com.delta.backup-pull.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. Test with: launchctl start com.delta.backup-pull && tail $LOG"
