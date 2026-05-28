#!/usr/bin/env node
/**
 * Copy emi-recipe-renderer dist assets from node_modules into site/lib/.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'site', 'lib');

let pkgRoot;
let distDir;
try {
  const entry = require.resolve('emi-recipe-renderer');
  distDir = path.dirname(entry);
  pkgRoot = path.dirname(distDir);
} catch {
  console.error('emi-recipe-renderer is not installed. Run: npm install');
  process.exit(1);
}
const required = ['emi.js', 'emi.css'];
for (const name of required) {
  if (!existsSync(path.join(distDir, name))) {
    console.error(`Missing ${path.join(distDir, name)} — build emi-recipe-renderer first (npm run build).`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

const copies = [
  ['emi.js', 'emi.js'],
  ['emi.css', 'emi.css'],
  ['emi.min.js', 'emi.min.js'],
  ['emi.min.css', 'emi.min.css'],
];

for (const [srcName, destName] of copies) {
  const src = path.join(distDir, srcName);
  if (!existsSync(src)) continue;
  copyFileSync(src, path.join(outDir, destName));
}

if (!existsSync(path.join(outDir, 'emi.min.js'))) {
  copyFileSync(path.join(distDir, 'emi.js'), path.join(outDir, 'emi.min.js'));
}
if (!existsSync(path.join(outDir, 'emi.min.css'))) {
  copyFileSync(path.join(distDir, 'emi.css'), path.join(outDir, 'emi.min.css'));
}

const version = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')).version;
console.log(`synced emi-recipe-renderer@${version} -> site/lib/`);
