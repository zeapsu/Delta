#!/usr/bin/env bash
# Local-dev stand-in for the hermes CLI (not installed on the Mac):
#   HERMES_CMD=./scripts/hermes-stub.sh npm run dev
sleep 1
cat <<'EOF'
Here's a **stubbed** reply from the Hermes bridge (prompt received fine).

- markdown rendering: works
- streaming path: exercised

| category | spend |
|---|---|
| FOOD_AND_DRINK | $123.45 |
| TRANSPORTATION | $67.89 |
EOF
