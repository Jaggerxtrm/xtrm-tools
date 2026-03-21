#!/usr/bin/env node
// prepack-plugin.mjs — runs before npm pack/publish
// Replaces plugins/xtrm-tools/{hooks,skills} symlinks with real copies
// so that npm pack includes them. postpack-plugin.mjs restores the symlinks.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const pluginDir = path.join(root, 'plugins', 'xtrm-tools');

for (const name of ['hooks', 'skills']) {
    const link = path.join(pluginDir, name);
    const target = path.join(root, name);

    // Remove existing symlink or dir
    if (fs.existsSync(link) || fs.lstatSync(link).isSymbolicLink()) {
        fs.rmSync(link, { recursive: true, force: true });
    }

    // Copy real directory
    fs.cpSync(target, link, { recursive: true });
    console.log(`prepack: copied ${name}/ → plugins/xtrm-tools/${name}/`);
}
