#!/usr/bin/env bash
# Resolve a GitHub release tag: pinned value or latest semver on the repo.
#
# Usage:
#   bash scripts/ci/resolve-release-tag.sh <owner/repo|git-url> [pinned-tag]
#   bash scripts/ci/resolve-release-tag.sh --version <owner/repo> [pinned-tag]
#
# Examples:
#   bash scripts/ci/resolve-release-tag.sh jmecn/minecraft-web-export
#   bash scripts/ci/resolve-release-tag.sh jmecn/TFG-Recipe-Viewer-React --version
#   bash scripts/ci/resolve-release-tag.sh https://github.com/TerraFirmaGreg-Team/Modpack-Modern.git 0.12.8
set -euo pipefail

CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/github-release.sh
source "$CI_DIR/lib/github-release.sh"

strip_v=0
args=()
for arg in "$@"; do
  case "$arg" in
    --version|-V) strip_v=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) args+=("$arg") ;;
  esac
done

repo="${args[0]:?repo required (owner/name or https://github.com/...git)}"
pinned="${args[1]:-}"

if [[ "$strip_v" -eq 1 ]]; then
  resolve_github_release_version "$repo" "$pinned"
else
  resolve_github_release_ref "$repo" "$pinned"
fi
