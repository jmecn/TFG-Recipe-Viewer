#!/usr/bin/env bash
set -euo pipefail

BUNDLE="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
test -f "$BUNDLE/bundle.json"
test -f "$BUNDLE/recipes/index.json"
