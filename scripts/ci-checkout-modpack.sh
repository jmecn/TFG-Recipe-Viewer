#!/usr/bin/env bash
# Check out the latest Modpack-Modern *release* tag (semver x.y.z).
# Clones TerraFirmaGreg-Team/Modpack-Modern when missing (CI-friendly).
# Override: MODPACK_TAG=0.12.8 ./scripts/ci-checkout-modpack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
MODPACK_REPO="${MODPACK_REPO:-https://github.com/TerraFirmaGreg-Team/Modpack-Modern.git}"

cd "$ROOT"

if [[ ! -e "$MP/.git" ]]; then
  echo "Cloning Modpack-Modern into $MP ..."
  git clone "$MODPACK_REPO" "$MP"
fi

cd "$MP"
git fetch --tags --force origin

if [[ -n "${MODPACK_TAG:-}" ]]; then
  TAG="$MODPACK_TAG"
  echo "Using MODPACK_TAG override: $TAG"
else
  TAG="$(git tag -l | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n 1)"
  if [[ -z "$TAG" ]]; then
    echo "error: no semver release tags found" >&2
    exit 1
  fi
  echo "Latest release tag: $TAG"
fi

git checkout "$TAG"
git describe --tags --exact-match 2>/dev/null || git describe --tags --always

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "modpack_tag=$TAG" >> "$GITHUB_OUTPUT"
fi
