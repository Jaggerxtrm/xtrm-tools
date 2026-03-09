import kleur from 'kleur';

/** Semantic color tokens */
export const t = {
    // Status
    success:   (s: string) => kleur.green(s),
    error:     (s: string) => kleur.red(s),
    warning:   (s: string) => kleur.yellow(s),
    info:      (s: string) => kleur.cyan(s),       // was blue — unreadable on dark terminals

    // Hierarchy (3-tier weight system)
    header:    (s: string) => kleur.bold().white(s),  // section headers
    label:     (s: string) => kleur.dim(s),           // metadata labels
    muted:     (s: string) => kleur.gray(s),
    accent:    (s: string) => kleur.cyan(s),
    bold:      (s: string) => kleur.bold(s),
    dim:       (s: string) => kleur.dim(s),

    // Compound
    boldGreen: (s: string) => kleur.bold().green(s),
    boldRed:   (s: string) => kleur.bold().red(s),
};

/** Status symbols with colour baked in */
export const sym = {
    ok:       kleur.green('✓'),
    fail:     kleur.red('✗'),
    warn:     kleur.yellow('⚠'),

    // File change states — directional metaphor
    missing:  kleur.green('+'),
    outdated: kleur.yellow('↑'),
    drifted:  kleur.magenta('≠'),    // was red '!' — magenta = conflict/divergence

    arrow:    kleur.gray('→'),
    bullet:   kleur.gray('•'),
};
