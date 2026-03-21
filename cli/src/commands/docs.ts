import { Command } from 'commander';
import kleur from 'kleur';
import fs from 'fs-extra';
import path from 'path';
import { findRepoRoot } from '../utils/repo-root.js';
import { t, sym } from '../utils/theme.js';

interface Frontmatter {
    [key: string]: string | undefined;
}

interface DocEntry {
    filePath: string;
    relativePath: string;
    frontmatter: Frontmatter | null;
    sizeBytes: number;
    lastModified: Date;
    parseError?: string;
}

const REQUIRED_FIELDS = new Set(['title', 'type', 'status', 'updated_at', 'version']);

/** Parse YAML frontmatter from a markdown file (--- delimited block). */
function parseFrontmatter(content: string): Frontmatter | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    const fm: Frontmatter = {};
    for (const line of match[1].split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
        if (key) fm[key] = value;
    }
    return fm;
}

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

    return docs;
}
