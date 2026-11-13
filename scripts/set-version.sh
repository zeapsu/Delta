#!/usr/bin/env bash
# Puts a published release's version everywhere the repo names one:
# package.json (which the MCP server reports to agents), the home server app
# store files (home-server/pin.sh, image tag + Umbrel digest) and this repo's
# copy of the Homebrew formula (tarball URL + sha256). The release workflow
# runs it after the image for the tag is on GHCR and opens a PR with the result.
#   scripts/set-version.sh 1.4.0
set -euo pipefail
v="${1:?usage: scripts/set-version.sh <version, e.g. 1.4.0>}"
v="${v#v}"
cd "$(dirname "$0")/.."

npm version "$v" --no-git-tag-version --allow-same-version >/dev/null
home-server/pin.sh "$v"

url="https://github.com/zeapsu/Delta/archive/refs/tags/v$v.tar.gz"
sha=$(curl -fsSL "$url" | { command -v sha256sum >/dev/null && sha256sum || shasum -a 256; } | cut -d' ' -f1)
sed -i.bak -E \
  -e "s#^  url \".*\"#  url \"$url\"#" \
  -e "s#^  sha256 \".*\"#  sha256 \"$sha\"#" \
  homebrew/Formula/delta.rb
rm -f homebrew/Formula/delta.rb.bak
echo "Set version $v"
