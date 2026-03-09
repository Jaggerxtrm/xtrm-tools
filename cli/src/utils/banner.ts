import kleur from 'kleur';

// ── ASCII art ───────────────────────────────────────────────────────────────
const ART = [
    ' ██╗  ██╗████████╗██████╗ ███╗   ███╗    ████████╗ ██████╗  ██████╗ ██╗     ███████╗',
    ' ╚██╗██╔╝╚══██╔══╝██╔══██╗████╗ ████║    ╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██╔════╝',
    '  ╚███╔╝    ██║   ██████╔╝██╔████╔██║       ██║   ██║   ██║██║   ██║██║     ███████╗',
    '  ██╔██╗    ██║   ██╔══██╗██║╚██╔╝██║       ██║   ██║   ██║██║   ██║██║     ╚════██║',
    ' ██╔╝ ██╗   ██║   ██║  ██║██║ ╚═╝ ██║       ██║   ╚██████╔╝╚██████╔╝███████╗███████║',
    ' ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝       ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚══════╝',
];

const ART_WIDTH = 84;

// ── Detection helpers ───────────────────────────────────────────────────────

function isTTY(): boolean { return Boolean(process.stdout.isTTY); }

function hasColor(): boolean {
    if (process.env.NO_COLOR !== undefined) return false;
    if (process.env.FORCE_COLOR !== undefined) return true;
    if (process.env.TERM === 'dumb') return false;
    return isTTY();
}

function isCI(): boolean { return Boolean(process.env.CI); }
function isDumb(): boolean { return process.env.TERM === 'dumb'; }
function columns(): number { return process.stdout.columns ?? 80; }

function hasUnicode(): boolean {
    if (process.platform === 'win32') {
        return Boolean(process.env.WT_SESSION || process.env.TERM_PROGRAM);
    }
    const lang = (process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_CTYPE ?? '').toUpperCase();
    return lang.includes('UTF') || lang === '';
}

function hasTruecolor(): boolean {
    const ct = (process.env.COLORTERM ?? '').toLowerCase();
    return ct === 'truecolor' || ct === '24bit';
}

// ── Tier selection ──────────────────────────────────────────────────────────

type Tier = 0 | 1 | 2 | 3 | 4;

function selectTier(): Tier {
    if (!isTTY() || isDumb() || isCI()) return 4;
    if (!hasColor()) return 4;
    if (!hasUnicode()) return 3;
    const cols = columns();
    if (cols < 40) return 4;
    if (cols < 85) return 2;
    if (hasTruecolor()) return 0;
    return 1;
}

// ── Press-any-key with passive 1s auto-timeout ─────────────────────────────

function pressAnyKey(): Promise<void> {
    return new Promise(resolve => {
        process.stdout.write(kleur.dim('\n  press any key to continue...'));
        process.stdin.setRawMode(true);
        process.stdin.resume();

        let done = false;
        const finish = (): void => {
            if (done) return;
            done = true;
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\r\x1b[2K');
            resolve();
        };

        process.stdin.once('data', finish);
        setTimeout(finish, 4000);
    });
}

// ── Typewriter tagline (bold-white, 42ms per char) ─────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function typewriterTagline(text: string): Promise<void> {
    const CHAR_DELAY = 42; // ms per character
    const prefix = `  \x1b[2m\u2014\x1b[0m  \x1b[1m\x1b[37m`;
    const suffix = `\x1b[0m  \x1b[2m\u2014\x1b[0m`;

    process.stdout.write(prefix);
    for (const ch of text) {
        process.stdout.write(ch);
        await delay(CHAR_DELAY);
    }
    process.stdout.write(suffix + '\n');
}

// ── Truecolor gradient (item 7: 170°→230° teal→indigo, sat=0.6) ───────────

const HUE_START = 170;
const HUE_END   = 230;
const SAT       = 0.6;
const LIG       = 0.72;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number): number => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const RESET = '\x1b[0m';

function gradientLine(line: string): string {
    let out = '';
    const len = line.length;
    for (let i = 0; i < len; i++) {
        const t = len > 1 ? i / (len - 1) : 0;
        const hue = HUE_START + t * (HUE_END - HUE_START);
        const [r, g, b] = hslToRgb(hue, SAT, LIG);
        out += `\x1b[38;2;${r};${g};${b}m` + line[i];
    }
    return out + RESET;
}

// ── Renderers ───────────────────────────────────────────────────────────────

async function renderTier0(version: string): Promise<void> {
    const rule = '\x1b[2m ' + '─'.repeat(ART_WIDTH - 1) + '\x1b[0m';

    process.stdout.write('\n');
    for (const line of ART) {
        process.stdout.write(gradientLine(line) + '\n');
    }
    process.stdout.write(rule + '\n');
    process.stdout.write('  \x1b[2mv' + version + '\x1b[0m\n');
    await typewriterTagline('Sync agent tools across AI environments');
}

function renderTier1(version: string): void {
    console.log('');
    for (const line of ART) { console.log(kleur.cyan(line)); }
    console.log(kleur.dim(' ' + '─'.repeat(ART_WIDTH - 1)));
    console.log(kleur.dim('  v' + version));
    console.log(
        '  ' + kleur.dim('\u2014') + '  ' +
        kleur.bold().white('Sync agent tools across AI environments') +
        '  ' + kleur.dim('\u2014'),
    );
    console.log('');
}

function renderTier2(version: string): void {
    console.log('');
    console.log(
        kleur.cyan('  ◈  ') +
        kleur.bold().white('xtrm-tools') +
        kleur.dim('  v' + version),
    );
    console.log(kleur.dim('     Sync agent tools across AI environments'));
    console.log('');
}

function renderTier3(version: string): void {
    console.log('');
    console.log(kleur.bold('  xtrm-tools') + kleur.dim(' v' + version));
    console.log(kleur.dim('  Sync agent tools across AI environments'));
    console.log('');
}

function renderTier4(version: string): void {
    console.log('');
    console.log('xtrm-tools v' + version);
    console.log('Sync agent tools across AI environments');
    console.log('');
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function printBanner(version: string): Promise<void> {
    const tier = selectTier();
    switch (tier) {
        case 0: await renderTier0(version); break;
        case 1: renderTier1(version); break;
        case 2: renderTier2(version); break;
        case 3: renderTier3(version); break;
        case 4: renderTier4(version); return;
    }
    if (isTTY()) await pressAnyKey();
}
