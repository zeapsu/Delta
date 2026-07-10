#!/usr/bin/env bash
# Stop + disable all Delta systemd units on the Jetson. Run with sudo.
# Leaves the user's own hermes processes (9119/9118/messaging gateway) alone —
# never use `hermes serve --stop` here (it stops ALL hermes web servers).
set -euo pipefail

systemctl disable --now delta.service hermes-serve.service delta-backup.timer delta-sync.timer
systemctl --no-pager status delta.service hermes-serve.service delta-backup.timer delta-sync.timer || true
