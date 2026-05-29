#!/usr/bin/env bash
# npm ci for viewer + emi-recipe-renderer + emi-bundle-optimize (postinstall syncs site/lib).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RENDERER_VER="${RENDERER_VER:-${RENDERER_VERSION:?RENDERER_VER or RENDERER_VERSION required}}"
OPTIMIZE_VER="${OPTIMIZE_VER:-${OPTIMIZE_VERSION:?OPTIMIZE_VER or OPTIMIZE_VERSION required}}"

npm pkg set "dependencies.emi-recipe-renderer=${RENDERER_VER}"
npm pkg set "dependencies.emi-bundle-optimize=${OPTIMIZE_VER}"
# npm install (not ci) so CI resolves new versions before package-lock is updated for optimize
npm install --no-audit --no-fund

echo "emi-recipe-renderer@${RENDERER_VER}"
echo "emi-bundle-optimize@$(node -p "require('./node_modules/emi-bundle-optimize/package.json').version")"
