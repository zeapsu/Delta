#!/usr/bin/env bash
# Install/refresh Delta systemd units on the Jetson. Idempotent; run with sudo.
set -euo pipefail
cd "$(dirname "$0")"

cp delta.service delta-backup.service delta-backup.timer delta-sync.service delta-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now delta.service delta-backup.timer delta-sync.timer
systemctl restart delta.service
systemctl --no-pager status delta.service delta-backup.timer delta-sync.timer
