#!/usr/bin/env bash
# Remove Delta systemd units from the Jetson. Run with sudo.
# Leaves the repo, .env, DB, and backups untouched.
set -euo pipefail
cd "$(dirname "$0")"

./stop.sh
cd /etc/systemd/system
rm -f delta.service delta-backup.service delta-backup.timer delta-sync.service delta-sync.timer
systemctl daemon-reload
echo "Delta units removed."
