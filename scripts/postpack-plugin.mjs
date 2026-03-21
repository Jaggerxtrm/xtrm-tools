#!/usr/bin/env node
// postpack-plugin.mjs — runs after npm pack/publish
// Removes the real copies created by prepack-plugin.mjs and restores
// plugins/xtrm-tools/{hooks,skills} as symlinks to ../../{hooks,skills}.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const pluginDir = path.join(root, 'plugins', 'xtrm-tools');

for (const name of ['hooks', 'skills']) {
    const link = path.join(pluginDir, name);

    // Remove the real copy
    fs.rmSync(link, { recursive: true, force: true });

    // Restore symlink: ../../{hooks,skills} relative to plugins/xtrm-tools/
    fs.symlinkSync(path.join('..', '..', name), link);
    console.log(`postpack: restored plugins/xtrm-tools/${name} → ../../${name}`);
}
