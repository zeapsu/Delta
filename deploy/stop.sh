#!/usr/bin/env bash
# Stop + disable all Delta systemd units. Run with sudo.
set -euo pipefail

systemctl disable --now delta.service delta-backup.timer delta-sync.timer
systemctl --no-pager status delta.service delta-backup.timer delta-sync.timer || true
