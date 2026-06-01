import { TAG_BUCKET_ORDER } from './constants.js';
import { canonicalItemId } from './util.js';

export function catalogIdFromIndexEntry(ns, path) {
  if (path.includes(':')) return path;
  return `${ns}:${path}`;
}

export function parseItemsCatalog(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('items/index.json must be an object');
  const ids = new Set();
  for (const [ns, paths] of Object.entries(raw)) {
    if (ns === 'schema' || !Array.isArray(paths)) continue;
    for (const p of paths) {
      if (typeof p === 'string' && p.length > 0) ids.add(catalogIdFromIndexEntry(ns, p));
    }
  }
  return [...ids].sort();
}

export function itemDetailPaths(itemId) {
  const id = canonicalItemId(itemId);
  const sep = id.indexOf(':');
  if (sep <= 0 || sep >= id.length - 1) return [];
  return [`items/${id.slice(0, sep)}/${id.slice(sep + 1)}.json`];
}

export function itemDetailPath(itemId) {
  return itemDetailPaths(itemId)[0] || null;
}

export function mergeItemDetails(details) {
  const merged = {
    inputs: {},
    outputs: {},
    tags: { items: [], blocks: [], fluids: [] },
    tagsInBundle: { items: [], blocks: [], fluids: [] },
  };
  let schema = null;
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    if (detail.schema != null) schema = detail.schema;
    for (const side of ['inputs', 'outputs']) {
      if (!detail[side] || typeof detail[side] !== 'object') continue;
      for (const [categoryId, recipeIds] of Object.entries(detail[side])) {
        if (!Array.isArray(recipeIds)) continue;
        const bucket = merged[side][categoryId] || (merged[side][categoryId] = new Set());
        for (const recipeId of recipeIds) bucket.add(recipeId);
      }
    }
    for (const bucket of TAG_BUCKET_ORDER) {
      for (const tagId of detail?.tags?.[bucket] || []) {
        if (typeof tagId === 'string' && tagId.length > 0) merged.tags[bucket].push(tagId);
      }
      for (const tagId of detail?.tagsInBundle?.[bucket] || []) {
        if (typeof tagId === 'string' && tagId.length > 0) merged.tagsInBundle[bucket].push(tagId);
      }
    }
  }
  const out = {};
  if (schema != null) out.schema = schema;
  for (const side of ['inputs', 'outputs']) {
    if (Object.keys(merged[side]).length === 0) continue;
    out[side] = {};
    for (const [categoryId, recipeIds] of Object.entries(merged[side])) {
      out[side][categoryId] = [...recipeIds].sort();
    }
  }
  for (const bucket of TAG_BUCKET_ORDER) {
    if (merged.tags[bucket].length) {
      out.tags = out.tags || { items: [], blocks: [], fluids: [] };
      out.tags[bucket] = [...new Set(merged.tags[bucket])].sort();
    }
    if (merged.tagsInBundle[bucket].length) {
      out.tagsInBundle = out.tagsInBundle || { items: [], blocks: [], fluids: [] };
      out.tagsInBundle[bucket] = [...new Set(merged.tagsInBundle[bucket])].sort();
    }
  }
  return Object.keys(out).length ? out : null;
}
