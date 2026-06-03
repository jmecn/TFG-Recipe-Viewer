# Shared GitHub semver release resolution (git + bash only; no Node).
#
# Public API:
#   github_repo_git_url <owner/repo|https://github.com/...git>
#   resolve_latest_semver_release_tag <repo>
#   resolve_github_release_ref <repo> [pinned]
#   resolve_github_release_version <repo> [pinned]   # ref without leading v
#
# Repo-specific (read ci/build.env pins when set; empty pin = latest release):
#   resolve_modpack_tag
#   resolve_mwe_tag
#   resolve_site_viewer_version
#   resolve_renderer_version
#   resolve_optimize_version
#   resolve_hmc_version

github_repo_git_url() {
  local spec="${1:?repo required}"
  if [[ "$spec" == https://* ]]; then
    echo "$spec"
    return 0
  fi
  echo "https://github.com/${spec}.git"
}

# Strip optional leading v for x.y.z comparison.
_semver_strip() {
  echo "${1#v}"
}

# Exit 0 when $1 is strictly greater than $2 (semver, optional v prefix).
_semver_gt() {
  local a b a1 a2 a3 b1 b2 b3
  a="$(_semver_strip "$1")"
  b="$(_semver_strip "$2")"
  IFS=. read -r a1 a2 a3 <<< "$a"
  IFS=. read -r b1 b2 b3 <<< "$b"
  a1=${a1:-0}
  a2=${a2:-0}
  a3=${a3:-0}
  b1=${b1:-0}
  b2=${b2:-0}
  b3=${b3:-0}
  (( a1 > b1 )) && return 0
  (( a1 < b1 )) && return 1
  (( a2 > b2 )) && return 0
  (( a2 < b2 )) && return 1
  (( a3 > b3 )) && return 0
  return 1
}

resolve_latest_semver_release_tag() {
  local repo_spec="${1:?owner/name or git URL required}"
  local git_url best tag

  git_url="$(github_repo_git_url "$repo_spec")"
  best=""
  while IFS= read -r tag; do
    [[ -z "$tag" ]] && continue
    if [[ -z "$best" ]] || _semver_gt "$tag" "$best"; then
      best="$tag"
    fi
  done < <(
    git ls-remote --tags "$git_url" \
      | awk -F/ '{print $NF}' \
      | sed 's/\^{}//' \
      | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$'
  )

  if [[ -z "$best" ]]; then
    echo "error: no semver release tags found on ${git_url}" >&2
    return 1
  fi
  echo "$best"
}

# Echo pinned ref when set; otherwise latest semver tag (keeps v prefix if remote uses it).
resolve_github_release_ref() {
  local repo_spec="${1:?repo required}"
  local pinned="${2:-}"
  if [[ -n "$pinned" ]]; then
    echo "$pinned"
    return 0
  fi
  resolve_latest_semver_release_tag "$repo_spec"
}

# Same as resolve_github_release_ref but strips a leading v (site archive file names).
resolve_github_release_version() {
  local ref
  ref="$(resolve_github_release_ref "$@")" || return 1
  echo "${ref#v}"
}

resolve_mwe_tag() {
  resolve_github_release_ref \
    "${MWE_REPO:-jmecn/minecraft-web-export}" \
    "${MWE_TAG:-${MWE_VERSION:-}}"
}

resolve_site_viewer_version() {
  resolve_github_release_version \
    "${SITE_VIEWER_REPO:-jmecn/TFG-Recipe-Viewer-React}" \
    "${SITE_VIEWER_VER:-${SITE_VIEWER_VERSION:-}}"
}

resolve_renderer_version() {
  resolve_github_release_version \
    "${RENDERER_REPO:-jmecn/emi-recipe-renderer}" \
    "${RENDERER_VER:-${RENDERER_VERSION:-}}"
}

resolve_optimize_version() {
  resolve_github_release_version \
    "${OPTIMIZE_REPO:-jmecn/emi-bundle-optimize}" \
    "${OPTIMIZE_VER:-${OPTIMIZE_VERSION:-}}"
}

resolve_hmc_version() {
  resolve_github_release_version \
    "${HMC_REPO:-3arthqu4ke/headlessmc}" \
    "${HMC_VER:-${HMC_VERSION:-}}"
}
