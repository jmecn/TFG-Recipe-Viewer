(function () {
  'use strict';

  const GTCEU_TAG_PREFIX_PATTERN_OVERRIDES = {
    raw: 'raw_%s',
    raw_ore_block: 'raw_%s_block',
    refined_ore: 'refined_%s_ore',
    purified_ore: 'purified_%s_ore',
    crushed_ore: 'crushed_%s_ore',
    hot_ingot: 'hot_%s_ingot',
    chipped_gem: 'chipped_%s_gem',
    flawed_gem: 'flawed_%s_gem',
    flawless_gem: 'flawless_%s_gem',
    exquisite_gem: 'exquisite_%s_gem',
    small_dust: 'small_%s_dust',
    tiny_dust: 'tiny_%s_dust',
    impure_dust: 'impure_%s_dust',
    pure_dust: 'pure_%s_dust',
    dense_plate: 'dense_%s_plate',
    double_plate: 'double_%s_plate',
    long_rod: 'long_%s_rod',
    small_spring: 'small_%s_spring',
    fine_wire: 'fine_%s_wire',
    small_gear: 'small_%s_gear',
  };

  function splitRegistryId(registryId) {
    const bare = String(registryId || '').trim();
    const idx = bare.indexOf(':');
    if (idx <= 0 || idx >= bare.length - 1) return { namespace: '', path: bare };
    return { namespace: bare.slice(0, idx), path: bare.slice(idx + 1) };
  }

  function formatLangTemplate(template, arg) {
    return String(template ?? '').replace(/%s/g, arg);
  }

  function extractMaterialFromIdPattern(path, pattern) {
    if (!path || !pattern || !pattern.includes('%s')) return null;
    if (pattern.startsWith('%s_')) {
      const suffix = pattern.slice(2);
      if (path.endsWith(suffix)) {
        const material = path.slice(0, path.length - suffix.length);
        return material || null;
      }
      return null;
    }
    if (pattern.endsWith('_%s')) {
      const prefix = pattern.slice(0, -2);
      if (path.startsWith(prefix)) {
        const material = path.slice(prefix.length);
        return material || null;
      }
      return null;
    }
    const idx = pattern.indexOf('%s');
    const before = pattern.slice(0, idx);
    const after = pattern.slice(idx + 2);
    if (path.startsWith(before) && path.endsWith(after)) {
      const material = path.slice(before.length, path.length - after.length);
      return material || null;
    }
    return null;
  }

  function buildTagPrefixPatterns(langTable) {
    const patterns = [];
    const table = langTable && typeof langTable === 'object' ? langTable : {};
    for (const key of Object.keys(table)) {
      if (!key.startsWith('tagprefix.')) continue;
      const langSuffix = key.slice('tagprefix.'.length);
      const pattern = GTCEU_TAG_PREFIX_PATTERN_OVERRIDES[langSuffix] || `%s_${langSuffix}`;
      patterns.push({ langSuffix, pattern, langKey: key });
    }
    patterns.sort((a, b) => b.pattern.length - a.pattern.length);
    return patterns;
  }

  function resolveKey(translateKey, key) {
    if (!key) return null;
    const value = translateKey(key);
    return value != null && value !== key ? value : null;
  }

  function materialKey(namespace, materialPath) {
    return `material.${namespace}.${materialPath}`;
  }

  function composeTagPrefixLabel(namespace, materialPath, langSuffix, translateKey, langTable) {
    const matLabel = resolveKey(translateKey, materialKey(namespace, materialPath));
    if (!matLabel) return null;
    const polymerKey = `tagprefix.polymer.${langSuffix}`;
    const prefixKey = langTable?.[polymerKey] != null ? polymerKey : `tagprefix.${langSuffix}`;
    const prefixTemplate = resolveKey(translateKey, prefixKey);
    if (!prefixTemplate) return null;
    return formatLangTemplate(prefixTemplate, matLabel);
  }

  function translateComposedItem(namespace, path, translateKey, langTable) {
    if (!namespace || !path) return null;

    const bucketKey = `item.${namespace}.bucket`;
    if (path.endsWith('_bucket') && langTable?.[bucketKey] != null) {
      const materialPath = path.slice(0, -'_bucket'.length);
      const bucketTemplate = resolveKey(translateKey, bucketKey);
      const matLabel = resolveKey(translateKey, materialKey(namespace, materialPath));
      if (bucketTemplate && matLabel) return formatLangTemplate(bucketTemplate, matLabel);
    }

    for (const entry of buildTagPrefixPatterns(langTable)) {
      const materialPath = extractMaterialFromIdPattern(path, entry.pattern);
      if (!materialPath) continue;
      const label = composeTagPrefixLabel(namespace, materialPath, entry.langSuffix, translateKey, langTable);
      if (label) return label;
    }
    return null;
  }

  function translateComposedFluid(namespace, path, translateKey) {
    if (!namespace || !path) return null;
    return resolveKey(translateKey, materialKey(namespace, path));
  }

  function composeRegistry(registryId, kind, translateKey, langTable) {
    const { namespace, path } = splitRegistryId(registryId);
    if (!path) return null;
    if (kind === 'fluid') return translateComposedFluid(namespace, path, translateKey);
    if (kind === 'item' || kind === 'block') {
      return translateComposedItem(namespace, path, translateKey, langTable);
    }
    return null;
  }

  globalThis.GtceuTranslate = { composeRegistry };
}());
