#!/usr/bin/env bash
# Install/refresh Delta systemd units on the Jetson. Idempotent; run with sudo.
# Precondition: npm ci && npm run build already run in the repo, .env present.
set -euo pipefail
cd "$(dirname "$0")"

cp delta.service delta-backup.service delta-backup.timer delta-sync.service delta-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now delta.service delta-backup.timer delta-sync.timer
systemctl restart delta.service
# status is informational; exits non-zero if a unit isn't active yet
systemctl --no-pager status delta.service delta-backup.timer delta-sync.timer || true
