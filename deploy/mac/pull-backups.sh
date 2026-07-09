#!/bin/sh
# Pull Delta DB backups off the Jetson onto this Mac (run daily via launchd —
# see com.delta.backup-pull.plist). No --delete: the Jetson keeps 7 days,
# the Mac keeps 60.
set -eu

DEST="$HOME/Backups/delta"
mkdir -p "$DEST"

/usr/bin/rsync -a zeapsu@100.116.56.85:Projects/Delta/backups/ "$DEST/"

find "$DEST" -name 'delta-*.db' -mtime +60 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') pulled $(ls "$DEST" | wc -l | tr -d ' ') backups"
