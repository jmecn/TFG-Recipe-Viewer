#!/usr/bin/env bash
# Check out the latest Modpack-Modern *release* tag (semver x.y.z).
# Shallow clone (--depth 1) to avoid large history/objects in the full repo.
# Override: MODPACK_TAG=0.12.8 ./scripts/ci-checkout-modpack.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ci-modpack-tag.lib.sh"

TAG="$(resolve_modpack_tag)"
if [[ -n "${MODPACK_TAG:-}" ]]; then
  echo "Using MODPACK_TAG override: $TAG"
else
  echo "Latest release tag: $TAG"
fi

cd "$ROOT"

if [[ -e "$MP/.git" ]]; then
  current="$(git -C "$MP" describe --tags --exact-match 2>/dev/null || true)"
  if [[ "$current" == "$TAG" ]]; then
    echo "Modpack-Modern already at $TAG"
  else
    echo "Replacing $MP (was ${current:-unknown}) with shallow clone @ $TAG ..."
    rm -rf "$MP"
    git clone --depth 1 --branch "$TAG" "$MODPACK_REPO" "$MP"
  fi
else
  echo "Shallow cloning Modpack-Modern @ $TAG into $MP ..."
  git clone --depth 1 --branch "$TAG" "$MODPACK_REPO" "$MP"
fi

cd "$MP"
git describe --tags --exact-match 2>/dev/null || git describe --tags --always

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "modpack_tag=$TAG" >> "$GITHUB_OUTPUT"
fi
