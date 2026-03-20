#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const rootPkgPath = path.join(repoRoot, 'package.json');
const cliPkgPath = path.join(repoRoot, 'cli', 'package.json');

const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, 'utf8'));

if (!rootPkg.version || typeof rootPkg.version !== 'string') {
  console.error('Root package.json missing valid version');
  process.exit(1);
}

let changed = false;

// Sync version
if (cliPkg.version !== rootPkg.version) {
  cliPkg.version = rootPkg.version;
  changed = true;
}

// Sync bin — root is SSOT; rewrite paths from 'cli/dist/...' to 'dist/...'
if (rootPkg.bin) {
  const cliBin = Object.fromEntries(
    Object.entries(rootPkg.bin).map(([k, v]) => [k, v.replace(/^cli\//, '')])
  );
  if (JSON.stringify(cliPkg.bin) !== JSON.stringify(cliBin)) {
    cliPkg.bin = cliBin;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`, 'utf8');
  console.log(`Synced cli/package.json (version: ${rootPkg.version}, bin: ${Object.keys(cliPkg.bin ?? {}).join(', ')})`);
} else {
  console.log(`cli/package.json already in sync (${rootPkg.version})`);
}
