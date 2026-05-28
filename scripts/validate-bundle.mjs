#!/usr/bin/env node
/**
 * Contract smoke check for EMI bundle roots (renderer baseUrl).
 * With no args: reads site/bundles.json and validates each site/bundles/<id>.
 * With one arg: validates that directory only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(scriptDir, '../site');
const bundlesJsonPath = path.join(siteDir, 'bundles.json');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function assertFile(bundleRoot, rel) {
  const abs = path.join(bundleRoot, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing file: ${rel} (under ${bundleRoot})`);
  }
}

function parseRecipeIdsFromShards(bundleRoot, recipeIndex) {
  if (!Array.isArray(recipeIndex.namespaces)) {
    fail('recipes/index.json must contain namespaces array');
  }
  const ids = [];
  for (const ns of recipeIndex.namespaces) {
    if (!isNonEmptyString(ns)) continue;
    const shardRel = `recipes/shards/${ns}.json`;
    assertFile(bundleRoot, shardRel);
    const shard = readJson(path.join(bundleRoot, shardRel));
    if (!Array.isArray(shard)) fail(`${shardRel} must be string array`);
    for (const p of shard) {
      if (isNonEmptyString(p)) ids.push(`${ns}:${p}`);
    }
  }
  return ids;
}

function tagFilePath(tagId, type) {
  const sep = tagId.indexOf(':');
  if (sep <= 0 || sep >= tagId.length - 1) {
    fail(`invalid tag id: ${tagId}`);
  }
  const ns = tagId.slice(0, sep);
  const tagPath = tagId.slice(sep + 1);
  return `tags/${ns}/${type}/${tagPath}.json`;
}

function listTagFiles(bundleRoot) {
  const tagsRoot = path.join(bundleRoot, 'tags');
  const found = [];
  if (!fs.existsSync(tagsRoot)) return found;
  for (const ns of fs.readdirSync(tagsRoot, { withFileTypes: true })) {
    if (!ns.isDirectory() || ns.name === 'index.json') continue;
    for (const type of ['items', 'blocks', 'fluids']) {
      const typeDir = path.join(tagsRoot, ns.name, type);
      if (!fs.existsSync(typeDir)) continue;
      const walk = (dir, prefix) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            walk(full, `${prefix}${ent.name}/`);
            continue;
          }
          if (ent.name.endsWith('.json')) {
            const pathPart = prefix + ent.name.slice(0, -'.json'.length);
            found.push({ type, id: `${ns.name}:${pathPart}` });
          }
        }
      };
      walk(typeDir, '');
    }
  }
  return found;
}

function validateTagsCatalog(bundleRoot) {
  const tagFiles = listTagFiles(bundleRoot);
  if (tagFiles.length === 0) return;

  const catalogRel = 'tags/index.json';
  assertFile(bundleRoot, catalogRel);
  const catalog = readJson(path.join(bundleRoot, catalogRel));
  if (catalog.schema !== 1) {
    fail(`tags/index.json schema expected 1, got ${catalog.schema}`);
  }

  const listed = new Set();
  for (const type of ['items', 'blocks', 'fluids']) {
    const ids = catalog[type];
    if (ids == null) continue;
    if (!Array.isArray(ids)) fail(`tags/index.json "${type}" must be array`);
    for (const id of ids) {
      if (!isNonEmptyString(id)) fail(`tags/index.json ${type} has invalid id`);
      listed.add(`${type}:${id}`);
      assertFile(bundleRoot, tagFilePath(id, type));
    }
  }

  for (const { type, id } of tagFiles) {
    const key = `${type}:${id}`;
    if (!listed.has(key)) {
      fail(`tags/index.json missing ${type} entry: ${id}`);
    }
  }
}

function parseItemIdsFromIndex(itemsIndex) {
  const ids = [];
  for (const [namespace, paths] of Object.entries(itemsIndex || {})) {
    if (namespace === 'schema') continue;
    if (!Array.isArray(paths)) fail(`items/index.json bucket "${namespace}" must be array`);
    for (const p of paths) {
      if (isNonEmptyString(p)) ids.push(`${namespace}:${p}`);
    }
  }
  return ids;
}

function validateBundleRoot(bundleRoot) {
  if (!bundleRoot || !fs.existsSync(bundleRoot)) {
    fail(`bundle root does not exist: ${bundleRoot || '<unset>'}`);
  }

  const bundle = readJson(path.join(bundleRoot, 'bundle.json'));
  if (bundle.schema !== 1) fail(`bundle.schema expected 1, got ${bundle.schema}`);
  if (!Array.isArray(bundle.languages) || bundle.languages.length === 0) {
    fail('bundle.languages must be a non-empty array');
  }
  if (!bundle.missingIconId || typeof bundle.missingIconId !== 'string') {
    fail('bundle.json missing required field: missingIconId');
  }

  const recipeIndex = readJson(path.join(bundleRoot, 'recipes/index.json'));
  const recipeIds = parseRecipeIdsFromShards(bundleRoot, recipeIndex);
  if (recipeIds.length === 0) fail('recipes/index.json has zero recipeIds');

  for (const id of recipeIds) {
    const file = String(id).replace(/:/g, '_').replace(/\//g, '_') + '.json';
    const layout = `recipes/layouts/${file}`;
    if (layout.startsWith('emi/')) {
      fail(`layout path must be bundle-relative (recipes/layouts/...), not export-root path: ${id} -> ${layout}`);
    }
    assertFile(bundleRoot, layout);
  }

  assertFile(bundleRoot, 'textures/manifest.json');
  assertFile(bundleRoot, 'icons/index.json');
  assertFile(bundleRoot, 'icons/icons.css');
  assertFile(bundleRoot, `lang/${bundle.defaultLanguage || 'en_us'}.json`);
  assertFile(bundleRoot, 'items/index.json');

  const itemsIndex = readJson(path.join(bundleRoot, 'items/index.json'));
  const itemIds = parseItemIdsFromIndex(itemsIndex);
  for (const itemId of itemIds) {
    const sep = itemId.indexOf(':');
    const rel = `items/${itemId.slice(0, sep)}/${itemId.slice(sep + 1)}.json`;
    assertFile(bundleRoot, rel);
  }

  const icons = readJson(path.join(bundleRoot, 'icons/index.json'));
  if (!icons.items?.[bundle.missingIconId]) {
    fail(`icons/index.json missing missingIconId entry: ${bundle.missingIconId}`);
  }

  if (bundle.recipeCount != null && bundle.recipeCount !== recipeIds.length) {
    fail(`bundle.recipeCount=${bundle.recipeCount} but index has ${recipeIds.length} recipes`);
  }

  validateTagsCatalog(bundleRoot);

  console.log(`OK: ${bundleRoot}`);
  console.log(`  recipes: ${recipeIds.length}`);
  console.log(`  languages: ${bundle.languages.length}`);
  console.log(`  missingIconId: ${bundle.missingIconId}`);
}

const argRoot = process.argv[2] || process.env.EMI_BUNDLE_ROOT;

if (argRoot) {
  validateBundleRoot(path.resolve(argRoot));
  process.exit(0);
}

if (!fs.existsSync(bundlesJsonPath)) {
  fail(`missing ${bundlesJsonPath}; create it or pass a bundle directory as argv[2]`);
}

const cfg = readJson(bundlesJsonPath);
const ids = cfg.bundles;
if (!Array.isArray(ids) || ids.length === 0) {
  fail('bundles.json: "bundles" must be a non-empty array of ids');
}

let validated = 0;
const skipped = [];

for (const id of ids) {
  const bundleRoot = path.join(siteDir, 'bundles', id);
  if (!fs.existsSync(path.join(bundleRoot, 'bundle.json'))) {
    skipped.push(id);
    console.warn(`SKIP: "${id}" (not installed under site/bundles/${id}/)`);
    continue;
  }
  validateBundleRoot(bundleRoot);
  validated += 1;
}

const defaultId = cfg.default;
if (defaultId && !fs.existsSync(path.join(siteDir, 'bundles', defaultId, 'bundle.json'))) {
  fail(`default bundle "${defaultId}" is not installed. Run: npm run link -- --id ${defaultId} <export-dir>`);
}

if (validated === 0) {
  fail('no bundles installed; link at least one id from bundles.json');
}

console.log(`Validated ${validated} bundle(s).`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} (not installed): ${skipped.join(', ')}`);
}
