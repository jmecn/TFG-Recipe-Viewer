# Fetch the static React site from TFG-Recipe-Viewer-React GitHub Releases.
# Uses resolve_site_viewer_version from lib/github-release.sh (sourced via modpack-tag or deploy).

fetch_viewer_site_release() {
  local repo="${SITE_VIEWER_REPO:-jmecn/TFG-Recipe-Viewer-React}"
  local site_dir="${ROOT:?ROOT required}/site"
  local version tag

  version="$(resolve_site_viewer_version)" || return 1
  echo "TFG-Recipe-Viewer-React site @ v${version}"
  tag="v${version}"
  local archive="tfg-recipe-viewer-site-v${version}.tar.gz"

  if ! command -v gh >/dev/null 2>&1; then
    echo "::error::gh CLI required to download viewer site from ${repo} ${tag}" >&2
    return 1
  fi

  local staging
  staging="$(mktemp -d)"
  trap 'rm -rf "$staging"' RETURN

  echo "::group::Fetch viewer site ${tag} (${repo})"
  (
    cd "$staging"
    gh release download "$tag" --repo "$repo" --pattern "$archive" --clobber
  )

  if [[ ! -f "$staging/$archive" ]]; then
    echo "::error::Release asset ${archive} not found on ${repo} tag ${tag}" >&2
    return 1
  fi

  mkdir -p "$site_dir/bundles"
  find "$site_dir" -mindepth 1 -maxdepth 1 ! -name bundles -exec rm -rf {} +
  tar -xzf "$staging/$archive" -C "$site_dir"

  if [[ ! -f "$site_dir/index.html" ]]; then
    echo "::error::Extracted site missing index.html (layout=dist-root expected)" >&2
    return 1
  fi

  if [[ ! -f "$site_dir/bundles.json" ]]; then
    echo "::error::Extracted site missing bundles.json" >&2
    return 1
  fi

  if [[ -f "$site_dir/release-manifest.json" ]]; then
    local built pinned manifest_ver manifest_at
    built="$(sed -n 's/.*"rendererVersion"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$site_dir/release-manifest.json" | head -1)"
    manifest_ver="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$site_dir/release-manifest.json" | head -1)"
    manifest_at="$(sed -n 's/.*"builtAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$site_dir/release-manifest.json" | head -1)"
    pinned="${RENDERER_VERSION:-}"
    echo "release-manifest: site=${manifest_ver:-?} renderer=${built:-?} builtAt=${manifest_at:-?}"
    if [[ -n "$pinned" && -n "$built" && "$pinned" != "$built" ]]; then
      echo "::warning::Resolved emi-recipe-renderer=${pinned} differs from site release renderer=${built}"
    fi
  fi

  echo "Viewer site installed at ${site_dir} (${archive})"
  echo "::endgroup::"
}
