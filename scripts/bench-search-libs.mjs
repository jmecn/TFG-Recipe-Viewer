/**
 * Local benchmark: Fuse.js vs MiniSearch vs naive includes.
 * Simulates ~20k EMI-like rows: { id, name, haystack }.
 * Run: node scripts/bench-search-libs.mjs
 */
import Fuse from 'fuse.js';
import MiniSearch from 'minisearch';

const N = 20_000;
const QUERIES = ['ingot', 'gtceu', 'dust_1', 'fluid', 'minecraft', 'zzzznotfound'];
const WARMUP = 3;
const ITERS = 50;

const MODS = ['minecraft', 'gtceu', 'ae2', 'tfg', 'firmalife', 'create'];
const ITEMS = ['ingot', 'dust', 'plate', 'gear', 'rod', 'nugget', 'block', 'fluid_cell'];

function syntheticRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const mod = MODS[i % MODS.length];
    const item = ITEMS[i % ITEMS.length];
    const id = `${mod}:${item}_${i}`;
    const name = `${mod} ${item} #${i}`;
    const haystack = `${id} ${name}`.toLowerCase();
    rows.push({ id, name, haystack });
  }
  return rows;
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function bench(label, fn) {
  for (let w = 0; w < WARMUP; w++) fn();
  const times = [];
  for (let i = 0; i < ITERS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  const med = median(times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
  console.log(`${label}: median ${med.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`);
  return med;
}

const rows = syntheticRows(N);
console.log(`Dataset: ${N} rows, ~${(JSON.stringify(rows).length / 1024 / 1024).toFixed(2)} MB JSON (uncompressed shape)\n`);

// --- index build (one-time) ---
console.log('=== Index build (one-time) ===');
let fuseInstance;
bench('Fuse new Fuse(rows)', () => {
  fuseInstance = new Fuse(rows, {
    keys: ['haystack'],
    includeScore: true,
    threshold: 0.2,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
});

let mini;
bench('MiniSearch new + addAll', () => {
  mini = new MiniSearch({
    idField: 'id',
    fields: ['haystack'],
    storeFields: ['id', 'name'],
    searchOptions: { prefix: true, fuzzy: 0.2 },
  });
  mini.addAll(rows);
});

console.log('\n=== Query (re-use index; median over', ITERS, 'runs ×', QUERIES.length, 'queries) ===');

bench('Fuse search (reuse instance)', () => {
  for (const q of QUERIES) fuseInstance.search(q);
});

bench('MiniSearch search (reuse instance)', () => {
  for (const q of QUERIES) mini.search(q, { prefix: true, fuzzy: 0.2 });
});

bench('Naive haystack.includes (reuse rows)', () => {
  for (const q of QUERIES) {
    const ql = q.toLowerCase();
    let c = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].haystack.includes(ql)) c++;
    }
  }
});

console.log('\n=== Anti-pattern: Fuse new instance every search (like Field Guide search.js) ===');
bench('Fuse new + search per query batch', () => {
  for (const q of QUERIES) {
    const f = new Fuse(rows, {
      keys: ['haystack'],
      threshold: 0.2,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    f.search(q);
  }
});

const fuseStrict = new Fuse(rows, {
  keys: ['haystack'],
  threshold: 0.0,
  ignoreLocation: true,
  minMatchCharLength: 2,
});
const miniPrefix = new MiniSearch({
  idField: 'id',
  fields: ['haystack'],
  storeFields: ['id', 'name'],
});
miniPrefix.addAll(rows);

console.log('\n=== Variant configs (median query batch) ===');
bench('Fuse threshold=0.0 (stricter)', () => {
  for (const q of QUERIES) fuseStrict.search(q);
});
bench('MiniSearch prefix only (no fuzzy)', () => {
  for (const q of QUERIES) miniPrefix.search(q, { prefix: true });
});

console.log('\n=== Sample result counts (query "ingot") ===');
console.log('Fuse fuzzy 0.2:', fuseInstance.search('ingot').length);
console.log('Fuse strict 0.0:', fuseStrict.search('ingot').length);
console.log('MiniSearch fuzzy:', mini.search('ingot', { prefix: true, fuzzy: 0.2 }).length);
console.log('MiniSearch prefix:', miniPrefix.search('ingot', { prefix: true }).length);
let c = 0;
for (const r of rows) if (r.haystack.includes('ingot')) c++;
console.log('Naive includes:', c);
