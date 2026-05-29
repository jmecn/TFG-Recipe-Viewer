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

const ROUTES_DIR = 'recipes/routes';
const LAYOUT_PACKS_DIR = 'recipes/layout-packs';
const HARD_CAP_BYTES = 2 * 1024 * 1024;
const LEGACY_PATHS = ['recipes/index.json', 'recipes/shards', 'recipes/layouts'];

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

function assertFileSize(relPath, absPath, maxBytes) {
  const bytes = fs.statSync(absPath).size;
  if (bytes > maxBytes) {
    fail(`${relPath} exceeds ${maxBytes} bytes (actual ${bytes})`);
  }
  return bytes;
}

function readRecipeBundle(bundleRoot) {
  const bundle = readJson(path.join(bundleRoot, 'bundle.json'));
  if (bundle.schema !== 1) {
    fail(`bundle.schema expected 1, got ${bundle.schema}`);
  }
  if (!Number.isFinite(bundle.layoutSchema)) {
    fail('bundle.json missing required field: layoutSchema');
  }
  if (!Number.isFinite(bundle.scale)) {
    fail('bundle.json missing required field: scale');
  }
  if (!Number.isFinite(bundle.packMaxBytes) || bundle.packMaxBytes <= 0) {
    fail('bundle.json missing required field: packMaxBytes');
  }
  const { mods } = bundle;
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) {
    fail('bundle.json must contain mods object');
  }
  const namespaces = Object.keys(mods)
    .filter((id) => typeof id === 'string' && id.length > 0)
    .sort();
  if (namespaces.length === 0) {
    fail('bundle.json mods must be non-empty');
  }
  for (const ns of namespaces) {
    const mod = mods[ns];
    if (!mod || typeof mod !== 'object') {
      fail(`bundle.json mods.${ns} must be an object`);
    }
    if (!Array.isArray(mod.routes) || mod.routes.length === 0) {
      fail(`bundle.json mods.${ns}.routes must be a non-empty array`);
    }
    if (!Array.isArray(mod.packs) || mod.packs.length === 0) {
      fail(`bundle.json mods.${ns}.packs must be a non-empty array`);
    }
    for (const file of mod.routes) {
      if (typeof file !== 'string' || file.length === 0) {
        fail(`bundle.json mods.${ns}.routes entries must be non-empty strings`);
      }
    }
    for (const pack of mod.packs) {
      if (!pack || typeof pack !== 'object') {
        fail(`bundle.json mods.${ns}.packs entries must be objects`);
      }
      if (typeof pack.file !== 'string' || pack.file.length === 0) {
        fail(`bundle.json mods.${ns}.packs[].file must be a non-empty string`);
      }
      if (!Number.isFinite(pack.bytes) || pack.bytes <= 0) {
        fail(`bundle.json mods.${ns}.packs[].bytes must be a positive number`);
      }
    }
  }
  return { bundle, mods, namespaces };
}

function readRouteShard(bundleRoot, namespace, file) {
  const rel = `${ROUTES_DIR}/${namespace}/${file}.json`;
  const abs = path.join(bundleRoot, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing route shard: ${rel}`);
  }
  assertFileSize(rel, abs, HARD_CAP_BYTES);
  const shard = readJson(abs);
  if (shard.schema !== 1) {
    fail(`${rel} schema expected 1, got ${shard.schema}`);
  }
  if (shard.namespace !== namespace) {
    fail(`${rel} namespace expected ${namespace}, got ${shard.namespace}`);
  }
  if (!shard.routes || typeof shard.routes !== 'object' || Array.isArray(shard.routes)) {
    fail(`${rel} must contain routes object`);
  }
  return shard.routes;
}

function readLayoutPack(bundleRoot, namespace, file) {
  const rel = `${LAYOUT_PACKS_DIR}/${namespace}/${file}.json`;
  const abs = path.join(bundleRoot, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing layout pack: ${rel}`);
  }
  const bytes = assertFileSize(rel, abs, HARD_CAP_BYTES);
  const pack = readJson(abs);
  if (pack.schema !== 1) {
    fail(`${rel} schema expected 1, got ${pack.schema}`);
  }
  if (pack.namespace !== namespace) {
    fail(`${rel} namespace expected ${namespace}, got ${pack.namespace}`);
  }
  if (!pack.layouts || typeof pack.layouts !== 'object' || Array.isArray(pack.layouts)) {
    fail(`${rel} must contain layouts object`);
  }
  return { pack, bytes, rel };
}

function readRecipeIds(bundleRoot) {
  const { bundle, mods, namespaces } = readRecipeBundle(bundleRoot);
  const recipeIds = [];

  for (const ns of namespaces) {
    const mod = mods[ns];
    const routeToPackIndex = new Map();

    for (const routeFile of mod.routes) {
      const routes = readRouteShard(bundleRoot, ns, routeFile);
      for (const [recipePath, packIndex] of Object.entries(routes)) {
        if (typeof recipePath !== 'string' || recipePath.length === 0) {
          fail(`${ROUTES_DIR}/${ns}/${routeFile}.json has invalid route key`);
        }
        if (!Number.isInteger(packIndex) || packIndex < 0 || packIndex >= mod.packs.length) {
          fail(`${ROUTES_DIR}/${ns}/${routeFile}.json routes["${recipePath}"]=${packIndex} out of range for packs (${mod.packs.length})`);
        }
        if (routeToPackIndex.has(recipePath)) {
          fail(`duplicate route path in mods.${ns}: ${recipePath}`);
        }
        routeToPackIndex.set(recipePath, packIndex);
        recipeIds.push(`${ns}:${recipePath}`);
      }
    }

    const layoutPaths = new Set();
    const packLayouts = [];
    for (let i = 0; i < mod.packs.length; i += 1) {
      const packRef = mod.packs[i];
      const { pack, bytes, rel } = readLayoutPack(bundleRoot, ns, packRef.file);
      if (packRef.bytes !== bytes) {
        fail(`${rel} bytes=${bytes} but bundle.mods.${ns}.packs[${i}].bytes=${packRef.bytes}`);
      }
      if (bytes > bundle.packMaxBytes) {
        fail(`${rel} exceeds bundle.packMaxBytes=${bundle.packMaxBytes} (actual ${bytes})`);
      }
      packLayouts[i] = pack.layouts;
      for (const recipePath of Object.keys(pack.layouts)) {
        layoutPaths.add(recipePath);
      }
    }

    for (const [recipePath, packIndex] of routeToPackIndex) {
      if (!Object.hasOwn(packLayouts[packIndex], recipePath)) {
        fail(`missing layout for ${ns}:${recipePath} in pack ${mod.packs[packIndex].file}`);
      }
    }

    if (routeToPackIndex.size !== layoutPaths.size) {
      fail(`mods.${ns} route/layout path sets differ (routes=${routeToPackIndex.size}, layouts=${layoutPaths.size})`);
    }
    for (const recipePath of routeToPackIndex.keys()) {
      if (!layoutPaths.has(recipePath)) {
        fail(`route path missing from layout packs: ${ns}:${recipePath}`);
      }
    }
    for (const recipePath of layoutPaths) {
      if (!routeToPackIndex.has(recipePath)) {
        fail(`layout path missing from route shards: ${ns}:${recipePath}`);
      }
    }
  }

  if (recipeIds.length === 0) {
    fail('bundle has zero recipe paths');
  }
  return { bundle, recipeIds };
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

  for (const rel of LEGACY_PATHS) {
    if (fs.existsSync(path.join(bundleRoot, rel))) {
      fail(`legacy path must not exist: ${rel}`);
    }
  }

  const { bundle, recipeIds } = readRecipeIds(bundleRoot);

  if (!Array.isArray(bundle.languages) || bundle.languages.length === 0) {
    fail('bundle.languages must be a non-empty array');
  }
  if (!bundle.languages.includes('en_us')) {
    fail('bundle.languages must include en_us');
  }
  if (!bundle.missingIconId || typeof bundle.missingIconId !== 'string') {
    fail('bundle.json missing required field: missingIconId');
  }

  assertFile(bundleRoot, 'textures/manifest.json');
  assertFile(bundleRoot, 'icons/index.json');
  const iconCssPath = path.join(bundleRoot, 'icons/icons.css');
  if (!fs.existsSync(iconCssPath)) {
    const icons = readJson(path.join(bundleRoot, 'icons/index.json'));
    const hasInlineAtlas = Object.values(icons?.items || {}).some((entry) => (
      entry
      && typeof entry === 'object'
      && Number.isInteger(entry.page)
      && Number.isFinite(entry.x)
      && Number.isFinite(entry.y)
    ));
    if (!hasInlineAtlas) {
      fail('icons/icons.css missing and icons/index.json has no inline atlas coordinates');
    }
  }

  const fallbackLang = bundle.languages.includes('en_us') ? 'en_us' : bundle.languages[0];
  assertFile(bundleRoot, `lang/${fallbackLang}.json`);
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
    fail(`bundle.recipeCount=${bundle.recipeCount} but routes have ${recipeIds.length} recipes`);
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
