#!/bin/sh
# Pull Delta's database backups from the server onto this Mac (run daily via
# launchd, see com.delta.backup-pull.plist). No --delete: the server keeps 7
# days, the Mac keeps 60.
#
# The source is an rsync path such as me@my-server:Delta/backups. install.sh
# saves it in `backup-source` next to this script (gitignored);
# DELTA_BACKUP_SOURCE overrides it.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
SOURCE="${DELTA_BACKUP_SOURCE:-$(cat "$HERE/backup-source" 2>/dev/null || true)}"
if [ -z "$SOURCE" ]; then
  echo "No backup source set. Run: deploy/mac/install.sh <user@host:path/to/backups>" >&2
  exit 1
fi

DEST="$HOME/Backups/delta"
mkdir -p "$DEST"

/usr/bin/rsync -a "${SOURCE%/}/" "$DEST/"

find "$DEST" -name 'delta-*.db' -mtime +60 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') pulled $(ls "$DEST" | wc -l | tr -d ' ') backups"
