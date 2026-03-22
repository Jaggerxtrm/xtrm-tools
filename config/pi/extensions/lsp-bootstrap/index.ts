import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawnSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface LspTarget {
    /** Marker files that indicate this language is in use */
    markers: string[];
    /** Binary to check in PATH */
    bin: string;
    /** npm packages to install globally if bin is missing */
    npmPackages: string[];
    /** Human-readable label */
    label: string;
}

const TARGETS: LspTarget[] = [
    {
        label: "TypeScript/JavaScript",
        markers: ["tsconfig.json", "package.json"],
        bin: "typescript-language-server",
        npmPackages: ["typescript-language-server", "typescript"],
    },
    {
        label: "Python",
        markers: ["pyproject.toml", "requirements.txt", "setup.py"],
        bin: "pyright-langserver",
        npmPackages: ["pyright"],
    },
    {
        label: "Vue",
        markers: ["vue.config.js", "vite.config.ts", "vite.config.js"],
        bin: "vue-language-server",
        npmPackages: ["@vue/language-server"],
    },
    {
        label: "Svelte",
        markers: ["svelte.config.js", "svelte.config.ts"],
        bin: "svelteserver",
        npmPackages: ["svelte-language-server"],
    },
];

function isInPath(bin: string): boolean {
    try {
        execSync(`which ${bin}`, { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

function detectTargets(cwd: string): LspTarget[] {
    return TARGETS.filter(target =>
        target.markers.some(marker => fs.existsSync(path.join(cwd, marker)))
    );
}

function installPackages(packages: string[], ctx: any): void {
    const r = spawnSync("npm", ["install", "-g", ...packages], {
        encoding: "utf8",
        stdio: "pipe",
    });
    if (r.status !== 0) {
        ctx.ui.notify(`lsp-bootstrap: failed to install ${packages.join(" ")} — run manually: npm install -g ${packages.join(" ")}`, "warning");
    }
}

export default function register(api: ExtensionAPI) {
    api.on("session_start", async (ctx: any) => {
        const cwd = process.cwd();
        const detected = detectTargets(cwd);
        if (detected.length === 0) return;

        const toInstall = detected.filter(t => !isInPath(t.bin));
        if (toInstall.length === 0) return;

        for (const target of toInstall) {
            ctx.ui.notify(`lsp-bootstrap: installing ${target.label} language server (${target.npmPackages.join(", ")})…`, "info");
            installPackages(target.npmPackages, ctx);
        }

        const installed = toInstall.filter(t => isInPath(t.bin)).map(t => t.label);
        if (installed.length > 0) {
            ctx.ui.notify(`lsp-bootstrap: ready — ${installed.join(", ")}`, "info");
        }
    });
}
