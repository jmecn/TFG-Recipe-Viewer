#!/usr/bin/env bash
# Install viewer deps and sync emi-recipe-renderer into site/lib/ (no bundle yet).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VER="${RENDERER_VER:-${RENDERER_VERSION:?RENDERER_VER or RENDERER_VERSION required}}"
npm pkg set "dependencies.emi-recipe-renderer=${VER}"
npm install
