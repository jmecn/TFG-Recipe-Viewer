# Modpack-Modern tag resolution (sources shared github-release.sh).
MODPACK_REPO="${MODPACK_REPO:-https://github.com/TerraFirmaGreg-Team/Modpack-Modern.git}"

# shellcheck source=github-release.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/github-release.sh"

resolve_modpack_tag() {
  resolve_github_release_ref "$MODPACK_REPO" "${MODPACK_TAG:-}"
}
