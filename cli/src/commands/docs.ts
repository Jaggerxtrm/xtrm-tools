import { Command } from 'commander';
import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';
import { parseFrontmatter, DocEntry, scanDocFiles } from '../utils/docs-scanner.js';
import { readCache, writeCache, isCacheValid } from '../utils/docs-cache.js';

const REQUIRED_FIELDS = new Set(['title', 'type', 'status', 'updated_at', 'version']);

/** Collect all target doc files in a repo. */
async function collectDocFiles(repoRoot: string, filterPattern?: string): Promise<DocEntry[]> {
    const candidates: string[] = [];

    // Fixed candidates
    for (const name of ['README.md', 'CHANGELOG.md']) {
        const p = path.join(repoRoot, name);
        if (await fs.pathExists(p)) candidates.push(p);
    }

    // docs/ directory
    const docsDir = path.join(repoRoot, 'docs');
    if (await fs.pathExists(docsDir)) {
        const entries = await fs.readdir(docsDir);
        for (const entry of entries) {
            if (entry.endsWith('.md')) candidates.push(path.join(docsDir, entry));
        }
    }

    const results: DocEntry[] = [];
    for (const filePath of candidates) {
        const rel = path.relative(repoRoot, filePath);

        // Apply filter if provided
        if (filterPattern && !rel.includes(filterPattern) && !path.basename(filePath).includes(filterPattern)) {
            continue;
        }

        let entry: DocEntry;
        try {
            const stat = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf8');
            const frontmatter = parseFrontmatter(content);
            entry = {
                filePath,
                relativePath: rel,
                frontmatter,
                sizeBytes: stat.size,
                lastModified: stat.mtime,
            };
        } catch (err: any) {
            entry = {
                filePath,
                relativePath: rel,
                frontmatter: null,
                sizeBytes: 0,
                lastModified: new Date(0),
                parseError: err.message,
            };
        }
        results.push(entry);
    }

    return results;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function printEntry(entry: DocEntry, raw: boolean): void {
    const header = kleur.bold().white(entry.relativePath);
    const meta = kleur.gray(`  ${formatSize(entry.sizeBytes)}  modified ${formatDate(entry.lastModified)}`);
    console.log(`\n${header}${meta}`);

    if (entry.parseError) {
        console.log(kleur.red(`  ✗ Error reading file: ${entry.parseError}`));
        return;
    }

    if (!entry.frontmatter || Object.keys(entry.frontmatter).length === 0) {
        console.log(kleur.gray('  (no frontmatter)'));
        return;
    }

    if (raw) {
        console.log(kleur.gray('  ---'));
        for (const [k, v] of Object.entries(entry.frontmatter)) {
            console.log(`  ${k}: ${v}`);
        }
        console.log(kleur.gray('  ---'));
        return;
    }

    for (const [k, v] of Object.entries(entry.frontmatter)) {
        const keyStr = REQUIRED_FIELDS.has(k)
            ? kleur.cyan(k.padEnd(14))
            : kleur.gray(k.padEnd(14));
        const valStr = v ?? '';
        console.log(`  ${keyStr}  ${valStr}`);
    }
}

export function createDocsCommand(): Command {
    const docs = new Command('docs')
        .description('Documentation management commands');

    docs
        .command('show [filter]')
        .description('Display frontmatters for README, CHANGELOG, and docs/ files')
        .option('--raw', 'Output raw YAML frontmatter', false)
        .option('--json', 'Output JSON', false)
        .action(async (filter: string | undefined, opts: { raw: boolean; json: boolean }) => {
            const repoRoot = await findRepoRoot();
            const entries = await collectDocFiles(repoRoot, filter);

            if (entries.length === 0) {
                console.log(kleur.yellow('\n  No documentation files found.\n'));
                return;
            }

            if (opts.json) {
                const output = entries.map(e => ({
                    path: e.relativePath,
                    sizeBytes: e.sizeBytes,
                    lastModified: e.lastModified.toISOString(),
                    frontmatter: e.frontmatter,
                    parseError: e.parseError ?? null,
                }));
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            for (const entry of entries) {
                printEntry(entry, opts.raw);
            }

            const without = entries.filter(e => !e.frontmatter || Object.keys(e.frontmatter).length === 0).length;
            console.log(
                `\n  ${sym.ok} ${entries.length} file${entries.length !== 1 ? 's' : ''}` +
                (without > 0 ? kleur.gray(`  (${without} without frontmatter)`) : '') +
                '\n'
            );
        });

    docs
        .command('list')
        .description('List all .md files in the project with frontmatter summary')
        .option('--dir <path>', 'Filter to files under this directory')
        .option('--pattern <glob>', 'Filter by filename substring')
        .option('--filter <field=value>', 'Filter by frontmatter field, e.g. --filter type=service')
        .option('--json', 'Output JSON array', false)
        .option('--no-cache', 'Bypass cache and force fresh scan')
        .action(async (opts: { dir?: string; pattern?: string; filter?: string; json: boolean; cache: boolean }) => {
            const repoRoot = await findRepoRoot();

            // Parse --filter field=value
            let fmFilter: { field: string; value: string } | undefined;
            if (opts.filter) {
                const sep = opts.filter.indexOf('=');
                if (sep !== -1) {
                    fmFilter = { field: opts.filter.slice(0, sep), value: opts.filter.slice(sep + 1) };
                }
            }

            const scanOpts = { dir: opts.dir, pattern: opts.pattern, filter: fmFilter };

            // Try cache first
            let entries: DocEntry[] = [];
            let fromCache = false;

            if (opts.cache !== false) {
                const cached = await readCache(repoRoot);
                const fresh = await scanDocFiles(repoRoot, scanOpts);
                if (cached && isCacheValid(cached, fresh)) {
                    entries = fresh; // mtime-checked entries are already fresh
                    fromCache = true;
                } else {
                    entries = fresh;
                    await writeCache(repoRoot, fresh);
                }
            } else {
                entries = await scanDocFiles(repoRoot, scanOpts);
            }

            if (entries.length === 0) {
                console.log(kleur.yellow('\n  No documentation files found.\n'));
                return;
            }

            if (opts.json) {
                const output = entries.map(e => ({
                    path: e.relativePath,
                    sizeBytes: e.sizeBytes,
                    lastModified: e.lastModified.toISOString(),
                    frontmatter: e.frontmatter,
                    parseError: e.parseError ?? null,
                }));
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            const Table = require('cli-table3');
            const table = new Table({
                head: [
                    kleur.bold('Path'),
                    kleur.bold('Size'),
                    kleur.bold('Modified'),
                    kleur.bold('Title'),
                    kleur.bold('Type'),
                ],
                style: { head: [], border: [] },
            });

            let withoutFm = 0;
            for (const e of entries) {
                const hasFm = e.frontmatter && Object.keys(e.frontmatter).length > 0;
                if (!hasFm) withoutFm++;
                const row = [
                    hasFm ? e.relativePath : kleur.gray(e.relativePath),
                    kleur.dim(formatSize(e.sizeBytes)),
                    kleur.dim(formatDate(e.lastModified)),
                    hasFm ? (e.frontmatter?.title ?? kleur.gray('—')) : kleur.gray('—'),
                    hasFm ? (e.frontmatter?.type ?? kleur.gray('—')) : kleur.gray('—'),
                ];
                table.push(row);
            }

            console.log('\n' + table.toString());

            const cacheNote = fromCache ? kleur.dim('  (cached)') : '';
            const withoutNote = withoutFm > 0 ? kleur.gray(`  (${withoutFm} without frontmatter)`) : '';
            console.log(`\n  ${sym.ok} ${entries.length} file${entries.length !== 1 ? 's' : ''}${withoutNote}${cacheNote}\n`);
        });

    return docs;
}
