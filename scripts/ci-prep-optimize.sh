#!/usr/bin/env bash
# npm ci for emi-bundle-optimize (run after checkout, before MC export).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/emi-bundle-optimize"
npm ci
