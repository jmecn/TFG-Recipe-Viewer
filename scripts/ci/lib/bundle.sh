# Raw EMI bundle checks (schema v2).
verify_emi_bundle() {
  local bundle="${EXPORT_BUNDLE:?EXPORT_BUNDLE required}"
  local bundle_json="$bundle/bundle.json"

  if [[ ! -f "$bundle_json" ]]; then
    echo "::error::Missing $bundle_json" >&2
    return 1
  fi

  local schema
  schema="$(node -e "const b=require(process.argv[1]); console.log(b.schema??'')" "$bundle_json")"
  if [[ "$schema" != "2" ]]; then
    echo "::error::bundle.json schema must be 2 (got: ${schema:-<missing>})." >&2
    echo "::error::Raw bundle is not schema 2. Re-run Export EMI bundle (MWE ${MWE_VERSION:-?}); Deploy uses emi-raw-* artifact only." >&2
    return 1
  fi

  cd "$ROOT"
  npx emi-bundle-optimize validate "$bundle"
}
