import { DEV_PROFILE_BUNDLE_ID } from './constants.js';
import { fetchJson } from './http.js';
import { isDevProfile } from './routing.js';

export async function loadBundleCatalog() {
  const cfg = await fetchJson(globalThis.siteUrl('bundles.json'), { default: null, bundles: [] });
  const bundles = Array.isArray(cfg?.bundles) ? [...cfg.bundles] : [];
  const defaultId = cfg?.default ?? null;

  if (isDevProfile() && !bundles.includes(DEV_PROFILE_BUNDLE_ID)) {
    bundles.unshift(DEV_PROFILE_BUNDLE_ID);
  }

  if (bundles.length === 0) {
    throw new Error('bundles.json: bundles must be a non-empty array (or use ?profile=dev)');
  }
  return {
    default: isDevProfile() ? DEV_PROFILE_BUNDLE_ID : defaultId,
    bundles,
  };
}
