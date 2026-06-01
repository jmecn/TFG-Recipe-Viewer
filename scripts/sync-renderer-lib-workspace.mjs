#!/usr/bin/env node
/**
 * Copy emi-recipe-renderer dist assets from local workspace into site/lib/.
 *
 * Default source: ../emi-recipe-renderer/dist
 * Override via EMI_RENDERER_DIST env.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'site', 'lib');
const distDir = process.env.EMI_RENDERER_DIST
  ? path.resolve(process.env.EMI_RENDERER_DIST)
  : path.resolve(root, '..', 'emi-recipe-renderer', 'dist');

const required = ['emi.js', 'emi.css'];
for (const name of required) {
  const file = path.join(distDir, name);
  if (!existsSync(file)) {
    console.error(`Missing ${file} — build local emi-recipe-renderer first (npm run build).`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

for (const name of ['emi.js', 'emi.css', 'emi.min.js', 'emi.min.css']) {
  const src = path.join(distDir, name);
  if (existsSync(src)) {
    copyFileSync(src, path.join(outDir, name));
  }
}

if (!existsSync(path.join(outDir, 'emi.min.js'))) {
  copyFileSync(path.join(distDir, 'emi.js'), path.join(outDir, 'emi.min.js'));
}
if (!existsSync(path.join(outDir, 'emi.min.css'))) {
  copyFileSync(path.join(distDir, 'emi.css'), path.join(outDir, 'emi.min.css'));
}

console.log(`synced local emi-recipe-renderer (${distDir}) -> site/lib/`);
