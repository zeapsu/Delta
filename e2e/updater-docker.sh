#!/usr/bin/env bash
# Runs the real updater (scripts/updater.mjs) against a real Docker daemon.
#   e2e/updater-docker.sh <image>      e.g. delta:ci (docker build -t delta:ci .)
# Starts a local registry, runs the three compose services from it, publishes a
# "v2" image over `latest`, updates through POST /api/update and checks the
# result; then publishes a "v3" that crashes and checks that Delta is back on v2.
# Uses ports 5000 (registry) and $DELTA_TEST_PORT (3200). Cleans up after itself.
set -euo pipefail

IMAGE=${1:?usage: e2e/updater-docker.sh <image>}
PORT=${DELTA_TEST_PORT:-3200}
REG=127.0.0.1:5000
REF=$REG/delta:latest
export COMPOSE_PROJECT_NAME=deltaupd
export COMPOSE_PROFILES=updater
WORK=$(mktemp -d)
COMPOSE=$WORK/compose.yaml
BASE=http://127.0.0.1:$PORT

say() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; dump; exit 1; }
dump() {
  docker compose -f "$COMPOSE" ps -a 2>&1 || true
  for c in updater delta jobs; do echo "--- $c"; docker compose -f "$COMPOSE" logs --tail 40 "$c" 2>&1 || true; done
  docker logs --tail 60 "$COMPOSE_PROJECT_NAME-update-worker" 2>&1 || true
}
cleanup() {
  docker rm -f "$COMPOSE_PROJECT_NAME-update-worker" >/dev/null 2>&1 || true
  docker compose -f "$COMPOSE" down -v --remove-orphans >/dev/null 2>&1 || true
  docker ps -aq --filter "name=$COMPOSE_PROJECT_NAME-" | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker rm -f delta-updater-test-registry >/dev/null 2>&1 || true
  docker rmi "$REF" delta-updater-test:v2 delta-updater-test:v3 >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(eval("j."+process.argv[1]))}catch{console.log("")}})' "$1"; }
inspect() { docker inspect -f "$2" "$1"; }

# Waits until GET /api/update reports a finished state for the request made at $1.
wait_update() {
  local since=$1 deadline=$((SECONDS + 180)) body state req
  while [ $SECONDS -lt $deadline ]; do
    body=$(curl -fsS -m 5 "$BASE/api/update" 2>/dev/null || true)
    state=$(json state <<<"$body")
    req=$(json requestedAt <<<"$body")
    if [ -n "$req" ] && [ "$req" -ge "$since" ] 2>/dev/null; then
      case "$state" in done | failed | current) echo "$state"; return 0 ;; esac
    fi
    sleep 2
  done
  echo timeout
}

wait_app() {
  for _ in $(seq 1 60); do curl -fsS -m 3 -o /dev/null "$BASE/" 2>/dev/null && return 0; sleep 2; done
  fail "the app didn't answer on $BASE"
}

publish() { # publish <name> <Dockerfile body>: build FROM $IMAGE, push as :latest, drop the local tag so it must be pulled
  printf 'FROM %s\n%s\n' "$IMAGE" "$2" | docker build -q -t "delta-updater-test:$1" - >/dev/null
  docker tag "delta-updater-test:$1" "$REF"
  docker push -q "$REF" >/dev/null
  docker rmi "$REF" >/dev/null
}

say "Registry on $REG, v1 published"
docker run -d --name delta-updater-test-registry -p 127.0.0.1:5000:5000 registry:2 >/dev/null
for _ in $(seq 1 30); do curl -fsS -o /dev/null http://$REG/v2/ && break; sleep 1; done
docker tag "$IMAGE" "$REF"
docker push -q "$REF" >/dev/null

cat >"$COMPOSE" <<YAML
name: $COMPOSE_PROJECT_NAME
services:
  delta:
    image: $REF
    restart: unless-stopped
    environment:
      DELTA_ALLOWED_NETWORKS: 0.0.0.0/0
      DELTA_UPDATE_CHECK: "off"
      MY_CUSTOM_VAR: keep-me
    labels:
      test.custom: keep-me
    ports:
      - "127.0.0.1:$PORT:3000"
    volumes:
      - delta-data:/data
  jobs:
    image: $REF
    restart: unless-stopped
    network_mode: "service:delta"
    depends_on: [delta]
    command: ["node", "scripts/jobs.mjs"]
    volumes:
      - delta-data:/data
  updater:
    image: $REF
    profiles: [updater]
    restart: unless-stopped
    user: "0:0"
    network_mode: none
    read_only: true
    security_opt: ["no-new-privileges:true"]
    command: ["node", "scripts/updater.mjs"]
    volumes:
      - delta-data:/data
      - /var/run/docker.sock:/var/run/docker.sock
volumes:
  delta-data:
YAML

say "Starting the three services on v1"
docker compose -f "$COMPOSE" up -d
wait_app
V1=$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{.Image}}')
# The updater reports in once it has found itself.
for _ in $(seq 1 30); do [ "$(curl -fsS "$BASE/api/update" | json available)" = true ] && break; sleep 2; done
[ "$(curl -fsS "$BASE/api/update" | json available)" = true ] || fail "the app never saw the updater"
# Not through a bearer token (an unknown one is refused by proxy.ts, a real one by the route).
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer x' "$BASE/api/update")
{ [ "$code" = 401 ] || [ "$code" = 403 ]; } || fail "a bearer token was not refused ($code)"

say "Update to v2"
publish v2 $'LABEL delta.test=v2\nENV DELTA_TEST_DEFAULT=v2'
V2=$(docker image inspect delta-updater-test:v2 -f '{{.Id}}')
[ "$V1" != "$V2" ] || fail "v1 and v2 are the same image"
resp=$(curl -sS -m 120 -X POST -w '\n%{http_code}' "$BASE/api/update")
[ "$(tail -1 <<<"$resp")" = 202 ] || fail "POST /api/update answered: $resp"
since=$(head -1 <<<"$resp" | json requestedAt)
[ "$(wait_update "$since")" = done ] || fail "the update didn't finish with done"

sleep 5 # the worker removes itself when it exits
for s in delta jobs updater; do
  [ "$(inspect "$COMPOSE_PROJECT_NAME-$s-1" '{{.Image}}')" = "$V2" ] || fail "$s isn't on the v2 image"
  [ "$(inspect "$COMPOSE_PROJECT_NAME-$s-1" '{{.State.Running}}')" = true ] || fail "$s isn't running"
done
env=$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{json .Config.Env}}')
grep -q 'DELTA_TEST_DEFAULT=v2' <<<"$env" || fail "the new image's default env didn't apply: $env"
grep -q 'MY_CUSTOM_VAR=keep-me' <<<"$env" || fail "the custom env var was lost: $env"
[ "$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{index .Config.Labels "test.custom"}}')" = keep-me ] || fail "the custom label was lost"
[ "$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{index .Config.Labels "delta.test"}}')" = v2 ] || fail "the new image's label didn't apply"
wait_app
[ "$(inspect "$COMPOSE_PROJECT_NAME-jobs-1" '{{.HostConfig.NetworkMode}}')" = "container:$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{.Id}}')" ] || fail "jobs isn't on the new delta's network"
docker exec "$COMPOSE_PROJECT_NAME-delta-1" test -s /data/delta.db || fail "the database is gone"
docker exec "$COMPOSE_PROJECT_NAME-delta-1" sh -c 'ls /data/backups | grep -q -- -pre-update-' || fail "no pre-update backup"
names=$(docker ps -a --format '{{.Names}}' | grep "^$COMPOSE_PROJECT_NAME-" | sort | tr '\n' ' ')
[ "$names" = "deltaupd-delta-1 deltaupd-jobs-1 deltaupd-updater-1 " ] || fail "unexpected containers: $names"
[ "$(docker compose -f "$COMPOSE" ps --services | sort | tr '\n' ' ')" = "delta jobs updater " ] || fail "docker compose ps doesn't list the three services"
# And compose still manages them: it keeps the app and the updater as they are.
# (It recreates jobs once: compose's hash for a service that shares delta's
# network includes delta's container id, which the update changed.)
again=$(docker compose -f "$COMPOSE" up -d 2>&1)
grep -qE 'deltaupd-(delta|updater)-1 +Recreate' <<<"$again" && fail "compose wants to recreate the app or the updater after the update: $again"
[ "$(inspect "$COMPOSE_PROJECT_NAME-jobs-1" '{{.HostConfig.NetworkMode}}')" = "container:$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{.Id}}')" ] || fail "jobs isn't on delta's network after compose up"
echo "v2 ok"

say "A new version that crashes: back to v2"
# The new updater reports in again before it takes requests.
for _ in $(seq 1 30); do [ "$(curl -fsS "$BASE/api/update" | json available)" = true ] && break; sleep 2; done
publish v3 'CMD ["node","-e","process.exit(1)"]'
resp=$(curl -sS -m 120 -X POST -w '\n%{http_code}' "$BASE/api/update")
[ "$(tail -1 <<<"$resp")" = 202 ] || fail "POST /api/update answered: $resp"
since=$(head -1 <<<"$resp" | json requestedAt)
[ "$(wait_update "$since")" = failed ] || fail "the failing update didn't end with failed"
sleep 5
for s in delta jobs updater; do
  [ "$(inspect "$COMPOSE_PROJECT_NAME-$s-1" '{{.Image}}')" = "$V2" ] || fail "$s isn't back on the v2 image"
  [ "$(inspect "$COMPOSE_PROJECT_NAME-$s-1" '{{.State.Running}}')" = true ] || fail "$s isn't running after the rollback"
done
wait_app
[ "$(inspect "$COMPOSE_PROJECT_NAME-jobs-1" '{{.HostConfig.NetworkMode}}')" = "container:$(inspect "$COMPOSE_PROJECT_NAME-delta-1" '{{.Id}}')" ] || fail "jobs isn't on delta's network after the rollback"
names=$(docker ps -a --format '{{.Names}}' | grep "^$COMPOSE_PROJECT_NAME-" | sort | tr '\n' ' ')
[ "$names" = "deltaupd-delta-1 deltaupd-jobs-1 deltaupd-updater-1 " ] || fail "unexpected containers after the rollback: $names"
echo "rollback ok"
say "Updater test passed"
