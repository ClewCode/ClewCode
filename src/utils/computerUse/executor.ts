/**
 * CLI ComputerExecutor — cross-platform wrapper around PlatformAdapter.
 * Replaces the macOS-only @ant/computer-use-* implementation.
 */

import { logForDebugging } from '../debug.js';
import type { PlatformAdapter } from './platform/index.js';
import { getPlatformAdapter } from './platform/index.js';

/**
 * Simple synchronous clipboard wrapper for cross-platform use.
 */
export async function readClipboardText(): Promise<string> {
  return getPlatformAdapter().clipboardRead();
}

export async function writeClipboardText(text: string): Promise<void> {
  return getPlatformAdapter().clipboardWrite(text);
}

/**
 * Create a lightweight executor wrapper around the PlatformAdapter.
 * Returns the adapter directly — the MCP server uses it for tool dispatch.
 */
export function createCliExecutor(): { adapter: PlatformAdapter } {
  const adapter = getPlatformAdapter();
  logForDebugging(`[computer-use] Created executor for platform: ${adapter.platform}`);
  return { adapter };
}

/**
 * Unhide previously hidden apps (no-op on non-macOS platforms).
 * Kept for compatibility with stopHooks.ts/query.ts call sites.
 */
export async function unhideComputerUseApps(_bundleIds: readonly string[]): Promise<void> {
  // No-op: hiding apps is macOS-specific (we don't implement it cross-platform)
}
