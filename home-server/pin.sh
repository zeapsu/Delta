#!/usr/bin/env bash
# Point the app store manifests at a published release: sets the version and
# image tag everywhere, and the multi-arch digest Umbrel requires.
#   home-server/pin.sh 1.1.0
# Run after the docker workflow has published ghcr.io/zeapsu/delta:<version>
# (pushing a v<version> tag does that).
set -euo pipefail
v="${1:?usage: home-server/pin.sh <version, e.g. 1.1.0>}"
v="${v#v}"
cd "$(dirname "$0")"

token=$(curl -fsS "https://ghcr.io/token?scope=repository:zeapsu/delta:pull" | sed -E 's/.*"token":"([^"]+)".*/\1/')
digest=$(curl -fsSI -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
  "https://ghcr.io/v2/zeapsu/delta/manifests/$v" | tr -d '\r' | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}')
[ -n "$digest" ] || { echo "ghcr.io/zeapsu/delta:$v not found" >&2; exit 1; }

sed -i.bak -E "s#ghcr.io/zeapsu/delta:[^\"[:space:]]+#ghcr.io/zeapsu/delta:$v@$digest#" umbrel/delta/docker-compose.yml
sed -i.bak -E "s#ghcr.io/zeapsu/delta:[^\"[:space:]]+#ghcr.io/zeapsu/delta:$v#" casaos/Delta/docker-compose.yml
sed -i.bak -E "s#^version: .*#version: \"$v\"#" umbrel/delta/umbrel-app.yml
sed -i.bak -E "s#^  version: .*#  version: \"$v\"#" casaos/Delta/docker-compose.yml
rm -f umbrel/delta/*.bak casaos/Delta/*.bak
echo "Pinned $v ($digest)"
