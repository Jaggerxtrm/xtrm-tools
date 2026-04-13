import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Scaffold entrypoint for @xtrm/pi-extensions.
 *
 * Migration phases after this scaffold will delegate to concrete extension entrypoints
 * in ./extensions and shared internals in ./src/core.
 */
export default function initializePiExtensions(_pi: ExtensionAPI): void {
  // Scaffold only: intentionally no runtime wiring yet.
}
