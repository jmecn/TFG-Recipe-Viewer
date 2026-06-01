const { EmiRecipeRenderer } = globalThis;

export function stripFormattedText(text) {
  if (EmiRecipeRenderer?.stripMinecraftFormatting) {
    return EmiRecipeRenderer.stripMinecraftFormatting(text);
  }
  if (globalThis.MinecraftText?.strip) return globalThis.MinecraftText.strip(text);
  return String(text ?? '').replace(/§./g, '');
}

export function setFormattedText(el, text) {
  if (EmiRecipeRenderer?.setFormattedText) {
    EmiRecipeRenderer.setFormattedText(el, text);
    return;
  }
  if (globalThis.MinecraftText?.apply) {
    globalThis.MinecraftText.apply(el, text);
    return;
  }
  el.textContent = stripFormattedText(text);
}

export function displayNameForId(renderer, id) {
  const bare = canonicalItemId(id);
  const asItem = renderer.translateRegistry(id, 'item');
  if (asItem && asItem !== bare) return asItem;
  const asFluid = renderer.translateRegistry(id, 'fluid');
  if (asFluid && asFluid !== bare) return asFluid;
  return bare;
}

export function canonicalItemId(id) {
  if (!id) return id;
  let s = String(id);
  const brace = s.indexOf('{');
  if (brace >= 0) s = s.slice(0, brace);
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(0, at);
  return s;
}

export function normalizedFilterQuery(input) {
  return String(input || '').trim().toLowerCase();
}

export function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 80 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function buildPageRange(current, total, radius = 2) {
  if (total <= 1) return [1];
  const pages = new Set([1, total]);
  for (let i = current - radius; i <= current + radius; i += 1) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const page of sorted) {
    if (prev && page - prev > 1) out.push('…');
    out.push(page);
    prev = page;
  }
  return out;
}
