#!/usr/bin/env bash
# One-command install, update and uninstall for a Docker-hosted Delta.
#   ./delta.sh install     ask for Plaid keys, write .env, start Delta
#   ./delta.sh update      back up, pull the new version, restart
#   ./delta.sh uninstall   disconnect banks at Plaid, back up, remove everything
#   ./delta.sh backup      back up and copy the backups out to ./delta-backups
# Fresh machine, from anywhere:
#   curl -fsSL https://raw.githubusercontent.com/zeapsu/Delta/main/delta.sh | bash -s install
# What each step does, by hand: docs/self-hosting.md, docs/updating.md,
# docs/uninstalling.md.
set -euo pipefail

REPO=https://github.com/zeapsu/Delta.git

say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
# Prompts read the terminal, so they work under `curl | bash` too.
ask() { local v; read -r -p "$1" v </dev/tty; printf '%s' "$v"; }
ask_secret() { local v; read -rs -p "$1" v </dev/tty; echo >/dev/tty; printf '%s' "$v"; }

need_docker() {
  command -v docker >/dev/null || die "Docker isn't installed: https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || die "Docker's compose plugin is missing: https://docs.docker.com/compose/install/"
}

# Run from the checkout this script lives in (or the current folder under curl).
in_repo() {
  local here
  here=$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || pwd)
  [ -f "$here/docker-compose.yml" ] && cd "$here" && return 0
  [ -f docker-compose.yml ] && return 0
  return 1
}

# Set KEY=value in .env, replacing an existing or commented-out line.
set_env() {
  local key=$1 val=$2
  if grep -qE "^#? ?$key=" .env; then
    local tmp; tmp=$(mktemp)
    awk -v k="$key" -v v="$val" 'BEGIN{d=0} $0 ~ "^#? ?"k"=" { if (!d) { print k"="v; d=1 }; next } { print }' .env >"$tmp"
    cat "$tmp" >.env && rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$val" >>.env
  fi
}

# Prefer the published image; build from this checkout if it can't be pulled.
start() {
  # Baked into a local build so the in-app update notice knows its version.
  DELTA_COMMIT=$(git rev-parse HEAD 2>/dev/null || true); export DELTA_COMMIT
  if docker compose pull -q 2>/dev/null; then docker compose up -d
  else say "No image to pull, building from source (a few minutes)"; docker compose up -d --build; fi
}

wait_ready() {
  say "Waiting for Delta to start"
  for _ in $(seq 1 60); do
    if docker compose logs delta 2>/dev/null | grep -q '\[delta\] Plaid'; then
      docker compose logs delta | grep '\[delta\] Plaid' | tail -1
      return 0
    fi
    sleep 2
  done
  echo "Delta hasn't logged its startup check yet; see: docker compose logs delta"
}

backup() {
  say "Backing up the database"
  docker compose exec -T delta npm run -s backup
  mkdir -p delta-backups
  docker compose cp delta:/data/backups/. ./delta-backups/
  echo "Backups copied to $PWD/delta-backups"
}

cmd_install() {
  need_docker
  if ! in_repo; then
    command -v git >/dev/null || die "git isn't installed"
    [ -e delta ] && die "./delta already exists; cd into it and run ./delta.sh install"
    say "Downloading Delta into $PWD/delta"
    git clone -q "$REPO" delta
    cd delta
  fi

  if [ -f .env ]; then
    say ".env already exists, keeping it"
  else
    cp .env.example .env
    echo "Plaid keys are at https://dashboard.plaid.com/developers/keys"
    local id secret ip
    id=$(ask "Plaid client id: ")
    secret=$(ask_secret "Plaid sandbox secret (hidden): ")
    [ -n "$id" ] && [ -n "$secret" ] || die "both Plaid values are required"
    set_env PLAID_CLIENT_ID "$id"
    set_env PLAID_SANDBOX_SECRET "$secret"

    ip=$(tailscale ip -4 2>/dev/null | head -1 || true)
    if [ -n "$ip" ]; then
      echo "Found your Tailscale IP: $ip. Delta will only be reachable there."
    else
      echo "Tailscale isn't running, so Delta will only be reachable from this machine (127.0.0.1)."
      echo "To reach it from your phone later, see docs/self-hosting.md (Tailscale)."
      ip=127.0.0.1
    fi
    set_env DELTA_BIND "$ip"
    set_env DELTA_URL "http://$ip:3000"
    # docs/self-hosting.md: on Linux, published ports can hide the tailnet
    # client address; Docker Desktop on macOS always does.
    if [ "$ip" != 127.0.0.1 ]; then
      case "$(uname -s)" in
        Linux) set_env COMPOSE_FILE docker-compose.yml:docker-compose.tailscale.yml ;;
        Darwin) set_env DELTA_ALLOWED_NETWORKS 0.0.0.0/0 ;;
      esac
    fi
  fi

  start
  wait_ready
  local url; url=$(grep -E '^DELTA_URL=' .env | cut -d= -f2-)
  say "Delta is running at $url"
  echo "Open it, click Connect account, and in sandbox sign in with user_good / pass_good."
  echo "Connect an agent: docker compose exec delta npm run token -- create my-agent"
}

cmd_update() {
  need_docker; in_repo || die "run this from your Delta folder"
  backup
  say "Getting the new version"
  git pull --ff-only
  start
  wait_ready
  docker image prune -f >/dev/null || true
  say "Updated. If anything looks wrong, roll back with docs/updating.md#roll-back"
}

cmd_uninstall() {
  need_docker; in_repo || die "run this from your Delta folder"
  echo "This disconnects every linked bank at Plaid and deletes Delta's database,"
  echo "containers and image. A final backup is copied to $(dirname "$PWD")/delta-backups first."
  [ "$(ask 'Type "uninstall" to continue: ')" = uninstall ] || die "cancelled, nothing changed"

  if docker compose ps --status running --services 2>/dev/null | grep -qx delta; then
    say "Disconnecting your banks at Plaid"
    docker compose exec -T delta npm run -s unlink -- --yes ||
      [ "$(ask 'Some banks could not be removed (see above). Continue anyway? [y/N] ')" = y ] || die "stopped, nothing deleted"
    backup
    mkdir -p ../delta-backups && cp -R delta-backups/. ../delta-backups/
  else
    echo "Delta isn't running, so banks can't be disconnected here. Start it (docker compose up -d) and rerun,"
    [ "$(ask 'or continue without disconnecting them? [y/N] ')" = y ] || die "stopped, nothing deleted"
  fi

  say "Removing containers, data and image"
  docker compose down -v --rmi all
  say "Delta is uninstalled"
  echo "Left for you:"
  echo "  - remove Delta's MCP server from your agents"
  echo "  - delete this folder (it holds .env with your Plaid keys): cd .. && rm -rf '$PWD'"
  [ -d ../delta-backups ] && echo "  - your backups are in $(dirname "$PWD")/delta-backups; delete them when you no longer need them"
  echo "  - done with Plaid? rotate your keys at https://dashboard.plaid.com/developers/keys"
}

case "${1:-}" in
  install) cmd_install ;;
  update) cmd_update ;;
  uninstall) cmd_uninstall ;;
  backup) need_docker; in_repo || die "run this from your Delta folder"; backup ;;
  *) sed -n '2,8p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
