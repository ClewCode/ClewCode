/**
 * Cross-platform Escape key abort for Computer Use.
 * Uses Node.js readline's emitKeypressEvents on stdin.
 *
 * Replaces macOS-only CGEventTap (escHotkey.ts) with a cross-platform
 * approach that works on Windows, macOS, and Linux.
 */

import * as readline from 'node:readline';
import { logForDebugging } from '../debug.js';

let registered = false;
let keypressListener: ((str: string, key: readline.Key) => void) | null = null;

/**
 * Register an Escape key handler. When the user presses Escape, `onEscape`
 * is called. The caller should typically call `abortController.abort()`.
 *
 * Sets stdin to raw mode so we get individual keypress events instead of
 * line-buffered input. The handler is automatically removed on Ctrl+C too.
 *
 * @returns true if successfully registered
 */
export function registerEscKey(onEscape: () => void): boolean {
  if (registered) return true;

  try {
    if (!process.stdin.isTTY) {
      logForDebugging('[cu-abort] stdin is not a TTY, Escape key not available');
      return false;
    }

    // Enable keypress events on stdin
    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }

    keypressListener = (_str: string, key: readline.Key) => {
      if (key.name === 'escape') {
        logForDebugging('[cu-abort] Escape pressed, aborting computer use');
        onEscape();
      }
      // Ctrl+C — let the normal abort mechanism handle it
    };

    process.stdin.on('keypress', keypressListener);
    registered = true;
    logForDebugging('[cu-abort] Escape key listener registered');
    return true;
  } catch (err) {
    logForDebugging(`[cu-abort] Failed to register Escape key: ${err}`, { level: 'warn' });
    return false;
  }
}

/**
 * Unregister the Escape key handler and restore stdin.
 */
export function unregisterEscKey(): void {
  if (!registered) return;

  try {
    if (keypressListener) {
      process.stdin.removeListener('keypress', keypressListener);
      keypressListener = null;
    }
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  } catch (err) {
    logForDebugging(`[cu-abort] Failed to unregister Escape key: ${err}`, { level: 'warn' });
  }

  registered = false;
  logForDebugging('[cu-abort] Escape key listener unregistered');
}
