#!/usr/bin/env bash
# Pin emi-recipe-renderer version in site/index.html for jsDelivr (matches ci/build.env).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="${RENDERER_VERSION:?RENDERER_VERSION required}"
INDEX="$ROOT/site/index.html"

sed -i.bak "s/name=\"emi-renderer-version\" content=\"[^\"]*\"/name=\"emi-renderer-version\" content=\"${VER}\"/" "$INDEX"
rm -f "$INDEX.bak"
echo "site/index.html emi-renderer-version -> ${VER}"
