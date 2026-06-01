#!/usr/bin/env node
/**
 * Copy root language.json to site/language.json for static hosting.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'language.json');
const siteDir = path.join(root, 'site');
const dest = path.join(siteDir, 'language.json');

if (!existsSync(src)) {
  console.error(`missing ${src}`);
  process.exit(1);
}

mkdirSync(siteDir, { recursive: true });
copyFileSync(src, dest);
console.log(`synced language config -> ${dest}`);
