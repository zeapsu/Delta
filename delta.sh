#!/usr/bin/env bash
# Terminal install, update and uninstall for a Docker-hosted Delta.
#   ./delta.sh install     ask for Plaid keys (or skip: paste them on /setup), write .env, start Delta
#   ./delta.sh phone       move Delta onto your Tailscale address, to use it from your phone
#   ./delta.sh update      back up, pull the new version, restart
#   ./delta.sh uninstall   disconnect banks at Plaid, back up, remove everything
#   ./delta.sh backup      back up and copy the backups out to ./delta-backups
#   ./delta.sh reset-password   turn off the web UI password (forgot it); set a new one in Settings
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
  # Docker Desktop for Mac keeps its helpers (docker-credential-desktop, ...)
  # in folders a new shell may not have on PATH yet (fish, or a terminal opened
  # before the install). Without them every pull fails on "error getting credentials".
  local d
  for d in "$HOME/.docker/bin" /Applications/Docker.app/Contents/Resources/bin; do
    [ -d "$d" ] && case ":$PATH:" in *":$d:"*) ;; *) PATH="$PATH:$d" ;; esac
  done
  export PATH
  command -v docker >/dev/null || die "Docker isn't installed. Get Docker Desktop (Mac/Windows) or Docker Engine (Linux): https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || die "Docker's compose plugin is missing: https://docs.docker.com/compose/install/"
  if ! docker info >/dev/null 2>&1; then
    case "$(uname -s)" in
      Darwin) die "Docker isn't running. Open Docker Desktop, wait until it says Engine running, then run this again." ;;
      *) die "can't reach Docker. Start it (sudo systemctl start docker) and make sure your user may use it: https://docs.docker.com/engine/install/linux-postinstall/" ;;
    esac
  fi
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

# This machine's Tailscale IPv4, or nothing. The Mac app's CLI isn't on PATH.
tailscale_ip() {
  local ts ip
  for ts in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale; do
    command -v "$ts" >/dev/null 2>&1 || continue
    ip=$("$ts" ip -4 2>/dev/null | head -1 || true)
    if [ -n "$ip" ]; then printf '%s' "$ip"; return 0; fi
  done
  return 0
}

# Serve Delta on one address and write the settings that go with it.
use_address() {
  local ip=$1
  set_env DELTA_BIND "$ip"
  set_env DELTA_URL "http://$ip:3000"
  # Published ports hide the browser's address behind Docker's own (a port on
  # 127.0.0.1 is reached from the bridge gateway; Docker Desktop always does
  # it), so the API guard would refuse the browser. There the bind is what
  # keeps the port private. Linux + Tailscale uses host networking instead,
  # which keeps the real address: docs/self-hosting.md.
  if [ "$ip" != 127.0.0.1 ] && [ "$(uname -s)" = Linux ]; then
    set_env COMPOSE_FILE docker-compose.yml:docker-compose.tailscale.yml
    set_env DELTA_ALLOWED_NETWORKS 100.64.0.0/10
  else
    set_env DELTA_ALLOWED_NETWORKS 0.0.0.0/0
  fi
}

open_browser() {
  case "$(uname -s)" in
    Darwin) open "$1" 2>/dev/null || true ;;
    Linux)
      if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && command -v xdg-open >/dev/null; then
        xdg-open "$1" >/dev/null 2>&1 || true
      fi ;;
  esac
}

# Prefer the published image; build from this checkout if it can't be pulled.
start() {
  # Baked into a local build so the in-app update notice knows its version.
  DELTA_COMMIT=$(git rev-parse HEAD 2>/dev/null || true); export DELTA_COMMIT
  local err
  if err=$(docker compose pull -q 2>&1); then docker compose up -d
  else
    printf '%s\n' "$err" >&2
    # A build needs the same credential helper for its base image, so don't try one.
    if grep -q 'error getting credentials' <<<"$err"; then
      local helper; helper=$(grep -o 'docker-credential-[a-z-]*' <<<"$err" | head -1)
      die "Docker can't run its sign-in helper (${helper:-docker-credential-*}). Quit and reopen Docker Desktop, then run this again. Still failing? Delete the \"credsStore\" line in ~/.docker/config.json (Delta's image needs no sign-in)."
    fi
    say "Couldn't pull the image (see above), building from source (a few minutes)"
    docker compose up -d --build
  fi
}

wait_ready() {
  say "Waiting for Delta to start"
  for _ in $(seq 1 60); do
    # Not grep -q: exiting early can SIGPIPE compose, which pipefail reads as no match.
    if docker compose logs delta 2>/dev/null | grep '\[delta\] Plaid' >/dev/null; then
      docker compose logs delta | grep '\[delta\] Plaid' | tail -1
      return 0
    fi
    sleep 2
  done
  echo "Delta hasn't logged its startup check yet; see: docker compose logs delta"
  return 1
}

backup() {
  say "Backing up the database"
  docker compose exec -T delta npm run -s backup
  # They hold Plaid access tokens, so only this user may read the copies.
  mkdir -p delta-backups
  chmod 700 delta-backups
  docker compose cp delta:/data/backups/. ./delta-backups/
  chmod 600 delta-backups/*.db
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
    echo "(Press Enter to skip and paste them in your browser on Delta's setup page instead.)"
    local id secret ip
    id=$(ask "Plaid client id: ")
    if [ -n "$id" ]; then
      secret=$(ask_secret "Plaid sandbox secret (hidden): ")
      [ -n "$secret" ] || die "the sandbox secret is required with a client id"
      set_env PLAID_CLIENT_ID "$id"
      set_env PLAID_SANDBOX_SECRET "$secret"
    fi

    # Docker runs on UTC; dates (today, this month) should be the user's.
    local tz; tz=$(readlink /etc/localtime 2>/dev/null | sed -n 's#.*zoneinfo/##p' || true)
    [ -n "$tz" ] && set_env TZ "$tz"

    # A Mac starts on this computer only, and `./delta.sh phone` adds Tailscale
    # when wanted. A Linux box is usually a headless server, reached over Tailscale.
    ip=127.0.0.1
    if [ "$(uname -s)" = Linux ]; then
      ip=$(tailscale_ip)
      [ -n "$ip" ] || ip=127.0.0.1
    fi
    if [ "$ip" = 127.0.0.1 ]; then
      echo "Delta will be reachable from this computer only. For your phone, later: ./delta.sh phone"
    else
      echo "Found your Tailscale IP: $ip. Delta will only be reachable there."
    fi
    use_address "$ip"
  fi

  start
  wait_ready || true
  local url; url=$(grep -E '^DELTA_URL=' .env | cut -d= -f2-)
  say "Delta is running at $url"
  if grep -qE '^PLAID_CLIENT_ID=.+' .env; then
    echo "Next: Connect account (sandbox login: user_good / pass_good)."
    open_browser "$url"
  else
    echo "Next: paste your Plaid keys on the setup page, then Connect account."
    open_browser "$url/setup"
  fi
  echo "Connect an agent: Settings > Agents."
}

cmd_phone() {
  need_docker; in_repo || die "run this from your Delta folder"
  [ -f .env ] || die "no .env here yet; run ./delta.sh install first"
  local ip; ip=$(tailscale_ip)
  if [ -z "$ip" ]; then
    echo "Tailscale isn't running on this computer."
    echo "  1. Install it here and on your phone: https://tailscale.com/download"
    echo "  2. Sign in on both with the same account"
    echo "  3. Run ./delta.sh phone again"
    exit 1
  fi
  local old; old=$(grep -E '^DELTA_URL=' .env | cut -d= -f2- || true)
  local url="http://$ip:3000"
  use_address "$ip"
  say "Moving Delta to your Tailscale address"
  docker compose up -d
  wait_ready || true
  say "Delta is at $url"
  echo "Open it on your phone, with Tailscale on."
  if [ -n "$old" ] && [ "$old" != "$url" ]; then
    echo "It no longer answers at $old. Agents set up with that address need the new one (Settings > Agents)."
  fi
}

cmd_update() {
  need_docker; in_repo || die "run this from your Delta folder"
  backup
  # Delta overwrites today's backup when it restarts, and a second update today
  # would copy that over this one, so keep the pre-update state under its own name.
  local latest; latest=$(ls delta-backups/delta-????-??-??.db | tail -1)
  local keep="${latest%.db}-pre-update-$(date -u +%H%M%S).db"
  cp -p "$latest" "$keep"
  echo "Pre-update backup: $keep"
  local old; old=$(docker compose images -q 2>/dev/null | sort -u || true)
  say "Getting the new version"
  git pull --ff-only
  start
  wait_ready || die "the new version may not have started. Old image kept; to roll back see docs/updating.md#roll-back"
  # Remove the image this update replaced, unless something else still tags it.
  local id
  for id in $old; do
    [ "$(docker image inspect -f '{{len .RepoTags}}' "$id" 2>/dev/null)" = 0 ] &&
      docker image rm "$id" >/dev/null 2>&1 || true
  done
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
    # Separate commands: set -e ignores a failure before the last && and would
    # go on to delete the volume without this copy.
    mkdir -p ../delta-backups
    chmod 700 ../delta-backups
    cp -R delta-backups/. ../delta-backups/
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
  phone) cmd_phone ;;
  update) cmd_update ;;
  uninstall) cmd_uninstall ;;
  backup) need_docker; in_repo || die "run this from your Delta folder"; backup ;;
  reset-password) need_docker; in_repo || die "run this from your Delta folder"; docker compose exec delta npm run --silent password -- reset ;;
  *) sed -n '2,10p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
