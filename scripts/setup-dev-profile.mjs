#!/usr/bin/env node
/**
 * Prepare dev-profile local bundle mount:
 *   site/bundles/dev-local -> ../minecraft-web-export/run/export/minecraft-web-export/emi
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlesDir = path.join(root, 'site', 'bundles');
const linkPath = path.join(bundlesDir, 'dev-local');
const target = path.resolve(root, '..', 'minecraft-web-export', 'run', 'export', 'minecraft-web-export', 'emi');
const bundleJson = path.join(target, 'bundle.json');

mkdirSync(bundlesDir, { recursive: true });

if (!existsSync(target)) {
  console.warn(`WARN: dev bundle target missing: ${target}`);
} else if (!existsSync(bundleJson)) {
  console.warn(`WARN: ${bundleJson} missing. Run minecraft-web-export first.`);
}

if (existsSync(linkPath)) {
  const stat = lstatSync(linkPath);
  if (stat.isSymbolicLink()) {
    const current = path.resolve(path.dirname(linkPath), readlinkSync(linkPath));
    if (current === target) {
      console.log(`dev bundle link already ok: ${linkPath} -> ${target}`);
      process.exit(0);
    }
  }
  rmSync(linkPath, { recursive: true, force: true });
}

const relTarget = path.relative(path.dirname(linkPath), target);
symlinkSync(relTarget, linkPath, 'dir');
console.log(`created dev bundle link: ${linkPath} -> ${relTarget}`);
