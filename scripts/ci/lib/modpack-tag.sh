# Shared Modpack-Modern tag resolution (source from ci/*.sh).
MODPACK_REPO="${MODPACK_REPO:-https://github.com/TerraFirmaGreg-Team/Modpack-Modern.git}"

resolve_latest_modpack_tag() {
  git ls-remote --tags "$MODPACK_REPO" \
    | awk -F/ '{print $NF}' \
    | sed 's/\^{}//' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -Vu \
    | tail -n 1
}

resolve_modpack_tag() {
  if [[ -n "${MODPACK_TAG:-}" ]]; then
    echo "$MODPACK_TAG"
    return 0
  fi
  local tag
  tag="$(resolve_latest_modpack_tag)"
  if [[ -z "$tag" ]]; then
    echo "error: no semver release tags found on $MODPACK_REPO" >&2
    return 1
  fi
  echo "$tag"
}
