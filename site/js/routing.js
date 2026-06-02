import { DEV_PROFILE_BUNDLE_ID, DEV_QUERY_KEYS } from './constants.js';
import { canonicalItemId } from './util.js';

export function isDevProfile() {
  const params = new URLSearchParams(location.search);
  return params.get('profile') === 'dev';
}

export function parseLocationQuery() {
  const params = new URLSearchParams(location.search);
  const bundleToken = params.get('bundle') || (isDevProfile() ? DEV_PROFILE_BUNDLE_ID : '_');
  const search = params.get('search') || '';
  const lang = params.get('lang') || null;
  const rawPage = Number.parseInt(params.get('page') || '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const recipe = params.get('recipe');
  const tag = params.get('tag');
  const item = params.get('item');
  let view = 'items';
  let id = null;
  if (recipe) {
    view = 'recipe';
    id = recipe;
  } else if (tag) {
    view = 'tag';
    id = tag;
  } else if (item) {
    view = 'item';
    id = canonicalItemId(item);
  }
  return { bundleToken, view, id, search, lang, page };
}

export function buildAppUrl(route) {
  const p = new URLSearchParams();
  const current = new URLSearchParams(location.search);
  for (const key of DEV_QUERY_KEYS) {
    const v = current.get(key);
    if (v) p.set(key, v);
  }
  if (route.bundleToken && route.bundleToken !== '_') {
    p.set('bundle', route.bundleToken);
  }
  if (route.lang) p.set('lang', route.lang);
  const search = route.search != null ? String(route.search).trim() : '';
  if (search) p.set('search', search);
  const page = Number.isFinite(route.page) && route.page > 0 ? Math.floor(route.page) : 1;
  if (route.view === 'items' && page > 1) p.set('page', String(page));
  if (route.view === 'item' && route.id) p.set('item', route.id);
  else if (route.view === 'tag' && route.id) p.set('tag', route.id);
  else if (route.view === 'recipe' && route.id) p.set('recipe', route.id);
  const qs = p.toString();
  const base = globalThis.siteBase();
  return qs ? `${base}?${qs}` : base;
}
