/**
 * XTRM UI Extension
 *
 * Wraps pi-dex functionality with XTRM-specific preferences:
 * - Uses pi-dex themes and header
 * - Disables pi-dex footer (let custom-footer handle it)
 * - Provides /xtrm-ui commands for theme/density switching
 *
 * This eliminates the race condition between pi-dex's footer and
 * XTRM's custom-footer extension.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Box, Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";

// ============================================================================
// Types
// ============================================================================

export type XtrmThemeName = "pidex-dark" | "pidex-light";
export type XtrmDensity = "compact" | "comfortable";

export interface XtrmUiPrefs {
  themeName: XtrmThemeName;
  density: XtrmDensity;
  showHeader: boolean;
  compactTools: boolean;
  showFooter: boolean; // Our key addition - when false, skip setFooter()
}

// ============================================================================
// Defaults
// ============================================================================

export const XTRM_UI_PREFS_ENTRY = "xtrm-ui-prefs";

export const DEFAULT_PREFS: XtrmUiPrefs = {
  themeName: "pidex-light",
  density: "compact",
  showHeader: true,
  compactTools: true,
  showFooter: false, // XTRM: disable pi-dex footer, use custom-footer
};

// ============================================================================
// Preferences
// ============================================================================

type MaybeCustomEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
};

function normalizePrefs(input: unknown): XtrmUiPrefs {
  if (!input || typeof input !== "object") return { ...DEFAULT_PREFS };
  const source = input as Partial<XtrmUiPrefs>;
  return {
    themeName: source.themeName === "pidex-dark" ? "pidex-dark" : "pidex-light",
    density: source.density === "comfortable" ? "comfortable" : "compact",
    showHeader: source.showHeader ?? DEFAULT_PREFS.showHeader,
    compactTools: source.compactTools ?? DEFAULT_PREFS.compactTools,
    showFooter: source.showFooter ?? DEFAULT_PREFS.showFooter,
  };
}

function loadPrefs(entries: ReadonlyArray<MaybeCustomEntry>): XtrmUiPrefs {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "custom" && entry.customType === XTRM_UI_PREFS_ENTRY) {
      return normalizePrefs(entry.data);
    }
  }
  return { ...DEFAULT_PREFS };
}

function persistPrefs(pi: ExtensionAPI, prefs: XtrmUiPrefs): void {
  pi.appendEntry(XTRM_UI_PREFS_ENTRY, prefs);
}

// ============================================================================
// Chrome Application
// ============================================================================

function fitVisible(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function applyXtrmChrome(
  ctx: ExtensionContext,
  prefs: XtrmUiPrefs,
  getThinkingLevel: () => string
): void {
  // Theme
  ctx.ui.setTheme(prefs.themeName);

  // Tool expansion
  ctx.ui.setToolsExpanded(!prefs.compactTools);

  // Header (optional)
  if (prefs.showHeader) {
    ctx.ui.setHeader((_tui, theme) => ({
      invalidate() {},
      render(width: number): string[] {
        const boxWidth = width >= 54 ? 50 : Math.max(24, width);
        const model = ctx.model?.id ?? "no-model";
        const thinking = getThinkingLevel();
        const border = (text: string) => theme.fg("borderAccent", text);
        const leftPad = "";

        const top = leftPad + border(`╭${"─".repeat(Math.max(0, boxWidth - 2))}╮`);
        const line1 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", ">_")} ${theme.bold("XTRM")} ${theme.fg("dim", `(v1.0.0)`)}`,
            boxWidth - 2
          ) +
          border("│");
        const gap = leftPad + border("│") + fitVisible("", boxWidth - 2) + border("│");
        const line2 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", "model:".padEnd(11))}${model} ${thinking}${theme.fg("accent", "    /model")}${theme.fg("dim", " to change")}`,
            boxWidth - 2
          ) +
          border("│");
        const line3 =
          leftPad +
          border("│") +
          fitVisible(
            ` ${theme.fg("dim", "directory:".padEnd(11))}${basename(ctx.cwd)}`,
            boxWidth - 2
          ) +
          border("│");
        const bottom = leftPad + border(`╰${"─".repeat(Math.max(0, boxWidth - 2))}╯`);

        return [top, line1, gap, line2, line3, bottom];
      },
    }));
  } else {
    ctx.ui.setHeader(undefined);
  }

  // Footer - ONLY if showFooter is true (default false for XTRM)
  // This is the key difference from pi-dex - we let custom-footer handle it
  if (prefs.showFooter) {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const modelId = ctx.model?.id ?? "no-model";
          const thinking = getThinkingLevel();
          const contextUsage = ctx.getContextUsage();
          const leftPct = contextUsage?.percent != null ? `${100 - Math.round(contextUsage.percent)}% left` : undefined;
          const line = theme.fg(
            "dim",
            [`${modelId} ${thinking}`, leftPct, basename(ctx.cwd)]
              .filter(Boolean)
              .join(" · ")
          );
          return [truncateToWidth(line, width)];
        },
      };
    });
  }
  // If showFooter is false, we do NOT call setFooter - custom-footer will handle it
}

// ============================================================================
// Commands
// ============================================================================

function sendInfoMessage(pi: ExtensionAPI, title: string, content: string): void {
  pi.sendMessage({
    customType: "xtrm-ui-info",
    content,
    display: true,
    details: { title },
  });
}

function parseThemeArg(arg: string): XtrmThemeName | undefined {
  const normalized = arg.trim().toLowerCase();
  if (normalized === "dark" || normalized === "pidex-dark") return "pidex-dark";
  if (normalized === "light" || normalized === "pidex-light") return "pidex-light";
  return undefined;
}

function parseDensityArg(arg: string): XtrmDensity | undefined {
  const normalized = arg.trim().toLowerCase();
  if (normalized === "compact") return "compact";
  if (normalized === "comfortable" || normalized === "normal") return "comfortable";
  return undefined;
}

function registerCommands(pi: ExtensionAPI, getPrefs: () => XtrmUiPrefs, setPrefs: (p: XtrmUiPrefs) => void) {
  pi.registerMessageRenderer("xtrm-ui-info", (message, _options, theme) => {
    const title = (message.details as { title?: string } | undefined)?.title ?? "XTRM UI";
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.fg("customMessageLabel", theme.bold(title)), 0, 0));
    box.addChild(new Text(theme.fg("customMessageText", String(message.content ?? "")), 0, 0));
    return box;
  });

  pi.registerCommand("xtrm-ui", {
    description: "Show XTRM UI status and active preferences",
    handler: async (_args, ctx) => {
      const prefs = getPrefs();
      const contextUsage = ctx.getContextUsage();
      const lines = [
        `Theme: ${prefs.themeName}`,
        `Density: ${prefs.density}`,
        `Compact tools: ${prefs.compactTools ? "on" : "off"}`,
        `Show header: ${prefs.showHeader ? "yes" : "no"}`,
        `Show footer: ${prefs.showFooter ? "yes" : "no"} (custom-footer handles this)`,
        `Model: ${ctx.model?.id ?? "none"}`,
        `Context: ${contextUsage?.tokens ?? "unknown"}/${contextUsage?.contextWindow ?? "unknown"}`,
      ];
      sendInfoMessage(pi, "XTRM UI status", lines.join("\\n"));
    },
  });

  pi.registerCommand("xtrm-ui-theme", {
    description: "Switch XTRM UI theme: dark|light",
    getArgumentCompletions: (prefix) => {
      const values = ["dark", "light"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const themeName = parseThemeArg(args);
      if (!themeName) {
        ctx.ui.notify("Usage: /xtrm-ui-theme dark|light", "warning");
        return;
      }
      const prefs = { ...getPrefs(), themeName };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, () => "standard");
      ctx.ui.notify(`XTRM UI theme set to ${themeName}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-density", {
    description: "Switch XTRM UI density: compact|comfortable",
    getArgumentCompletions: (prefix) => {
      const values = ["compact", "comfortable"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const density = parseDensityArg(args);
      if (!density) {
        ctx.ui.notify("Usage: /xtrm-ui-density compact|comfortable", "warning");
        return;
      }
      const prefs = { ...getPrefs(), density };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, () => "standard");
      ctx.ui.notify(`XTRM UI density set to ${density}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-header", {
    description: "Toggle XTRM UI header: on|off",
    getArgumentCompletions: (prefix) => {
      const values = ["on", "off"].filter((item) => item.startsWith(prefix));
      return values.length > 0 ? values.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const showHeader = args.trim().toLowerCase() === "on";
      const prefs = { ...getPrefs(), showHeader };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, () => "standard");
      ctx.ui.notify(`XTRM UI header ${showHeader ? "enabled" : "disabled"}`, "info");
    },
  });

  pi.registerCommand("xtrm-ui-reset", {
    description: "Restore XTRM UI defaults",
    handler: async (_args, ctx) => {
      const prefs = { ...DEFAULT_PREFS };
      setPrefs(prefs);
      persistPrefs(pi, prefs);
      applyXtrmChrome(ctx, prefs, () => "standard");
      ctx.ui.notify("XTRM UI reset to defaults", "info");
    },
  });
}

// ============================================================================
// Main Extension
// ============================================================================

export default function xtrmUiExtension(pi: ExtensionAPI): void {
  let prefs: XtrmUiPrefs = { ...DEFAULT_PREFS };

  const getPrefs = () => prefs;
  const setPrefs = (p: XtrmUiPrefs) => { prefs = p; };

  registerCommands(pi, getPrefs, setPrefs);

  const refresh = (ctx: ExtensionContext) => {
    applyXtrmChrome(ctx, prefs, () => "standard");
  };

  pi.on("session_start", async (_event, ctx) => {
    prefs = loadPrefs(
      ctx.sessionManager.getEntries() as Array<MaybeCustomEntry>
    );
    refresh(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    refresh(ctx);
  });
}
