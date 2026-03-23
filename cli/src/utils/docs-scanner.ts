export interface Frontmatter {
    [key: string]: string | undefined;
    summary?: string;
}

export interface DocEntry {
    filePath: string;
    relativePath: string;
    frontmatter: Frontmatter | null;
    sizeBytes: number;
    lastModified: Date;
    parseError?: string;
}

export type FrontmatterFilter = { field: string; value: string };

/** Parse YAML frontmatter from a markdown file (--- delimited block). */
export function parseFrontmatter(content: string): Frontmatter | null {
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

    // Extract summary: first non-empty paragraph after the closing --- block
    const afterFrontmatter = content.slice(match[0].length).replace(/^\r?\n/, '');
    const firstPara = afterFrontmatter.split(/\r?\n\r?\n/)[0].replace(/\r?\n/g, ' ').trim();
    if (firstPara && !firstPara.startsWith('#')) {
        fm.summary = firstPara.slice(0, 120);
    }

    return fm;
}
