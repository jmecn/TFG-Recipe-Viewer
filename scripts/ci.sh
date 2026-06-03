#!/usr/bin/env bash
# CI entry: bash scripts/ci.sh <command> [args...]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cmd="${1:?Usage: ci.sh <command>}"
shift

case "$cmd" in
  load-config|prep-node|checkout-modpack|prepare-metadata|install-mwe|resolve-export-languages|setup-hmc|launch-mc-export|write-export-meta|collect-export-debug)
    exec bash "$ROOT/scripts/ci/export.sh" "$cmd" "$@"
    ;;
  print-versions)
    exec bash "$ROOT/scripts/ci/info.sh" "$cmd" "$@"
    ;;
  resolve-bundle-id|fetch-viewer-site|extract-raw-bundle|fetch-raw-bundle|verify-emi-bundle|optimize-and-stage|prep-deploy-site)
    exec bash "$ROOT/scripts/ci/deploy.sh" "$cmd" "$@"
    ;;
  *)
    echo "::error::Unknown ci.sh command: $cmd" >&2
    exit 1
    ;;
esac
