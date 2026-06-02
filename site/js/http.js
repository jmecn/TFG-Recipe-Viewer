import { ASSET_CACHE } from './constants.js';

/** In-memory dedup for bundle JSON fetches within a session. */
export const bundleJsonCache = new Map();

export function bundleBaseUrl(id) {
  const slug = String(id || '').trim().replace(/^\/+|\/+$/g, '');
  return globalThis.siteUrl(`bundles/${slug}/`);
}

export function joinBase(base, path) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export async function fetchJson(url, fallbackValue) {
  try {
    const r = await fetch(url);
    if (!r.ok) return fallbackValue;
    const contentType = String(r.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return fallbackValue;
    return await r.json();
  } catch {
    return fallbackValue;
  }
}

export async function fetchWithAssetCache(url) {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(url);
      if (hit) return { response: hit, fromCache: true };
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response.clone());
      return { response, fromCache: false };
    } catch {
      /* fall through */
    }
  }
  const response = await fetch(url);
  return { response, fromCache: false };
}

export function loadBundleJson(baseUrl, path, fallbackValue) {
  const key = joinBase(baseUrl, path);
  if (!bundleJsonCache.has(key)) {
    bundleJsonCache.set(key, (async () => {
      try {
        const { response } = await fetchWithAssetCache(key);
        if (!response.ok) return fallbackValue;
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          return fallbackValue;
        }
        try {
          return await response.json();
        } catch {
          return fallbackValue;
        }
      } catch {
        return fallbackValue;
      }
    })());
  }
  return bundleJsonCache.get(key);
}
