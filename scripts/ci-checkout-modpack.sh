#!/usr/bin/env bash
# Check out the latest Modpack-Modern *release* tag (semver x.y.z).
# Shallow clone (--depth 1) to avoid large history/objects in the full repo.
# Override: MODPACK_TAG=0.12.8 ./scripts/ci-checkout-modpack.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MP="${MODPACK_DIR:-$ROOT/Modpack-Modern}"
MODPACK_REPO="${MODPACK_REPO:-https://github.com/TerraFirmaGreg-Team/Modpack-Modern.git}"

resolve_latest_semver_tag() {
  git ls-remote --tags "$MODPACK_REPO" \
    | awk -F/ '{print $NF}' \
    | sed 's/\^{}//' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -Vu \
    | tail -n 1
}

if [[ -n "${MODPACK_TAG:-}" ]]; then
  TAG="$MODPACK_TAG"
  echo "Using MODPACK_TAG override: $TAG"
else
  TAG="$(resolve_latest_semver_tag)"
  if [[ -z "$TAG" ]]; then
    echo "error: no semver release tags found on $MODPACK_REPO" >&2
    exit 1
  fi
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
