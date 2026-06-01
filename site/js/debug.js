/** Enable with ?debug=virtual (or ?debug=all). */

export function isVirtualDebug() {
  const raw = new URLSearchParams(location.search).get('debug') || '';
  const parts = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parts.includes('virtual') || parts.includes('all') || parts.includes('1');
}

export function vlog(event, detail = {}) {
  if (!isVirtualDebug()) return;
  console.log('[recipe-viewer:virtual]', event, detail);
}
