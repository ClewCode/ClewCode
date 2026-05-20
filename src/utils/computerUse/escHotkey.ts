/**
 * Escape key abort for Computer Use — cross-platform implementation.
 *
 * Uses Node.js readline emitKeypressEvents on stdin instead of macOS
 * CGEventTap. Works on Windows, macOS, and Linux.
 *
 * Re-exports from the new cross-platform abortKey.ts for backwards
 * compatibility with existing callers (cleanup.ts, wrapper.tsx).
 */

import { registerEscKey, unregisterEscKey } from './abortKey.js';

// Re-export with the same names as the original macOS implementation
export { registerEscKey as registerEscHotkey, unregisterEscKey as unregisterEscHotkey };

/**
 * Notify that an Escape press is expected (model-synthesized).
 * Not needed for the stdin-based implementation — we only care about
 * *user* Escape presses, which are detected by the keypress event.
 */
export function notifyExpectedEscape(): void {
  // No-op: stdin-based keypress only captures user input
}
