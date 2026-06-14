/**
 * Cross-platform terminal clearing with scrollback support.
 * Detects modern terminals that support ESC[3J for clearing scrollback.
 */

import { CURSOR_HOME, csi, ERASE_SCREEN, ERASE_SCROLLBACK } from './termio/csi.js';

// HVP (Horizontal Vertical Position) - legacy Windows cursor home
const CURSOR_HOME_WINDOWS = csi(0, 'f');

import { getWindowsConsoleType, hasConPty, isLegacyConsole, supportsAnsiEscapeSequences } from '../utils/windowsTerminal.js';

function isModernWindowsTerminal(): boolean {
  // Use shared detection logic for consistency
  if (hasConPty()) {
    return true;
  }

  // mintty (GitBash/MSYS2/Cygwin) supports modern escape sequences
  if (getWindowsConsoleType() === 'mintty') {
    return true;
  }

  return false;
}

/**
 * Returns the ANSI escape sequence to clear the terminal including scrollback.
 * Automatically detects terminal capabilities.
 */
export function getClearTerminalSequence(): string {
  if (process.platform === 'win32') {
    if (isModernWindowsTerminal()) {
      return ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME;
    } else {
      // Legacy Windows console - can't clear scrollback
      return ERASE_SCREEN + CURSOR_HOME_WINDOWS;
    }
  }
  return ERASE_SCREEN + ERASE_SCROLLBACK + CURSOR_HOME;
}

/**
 * Clears the terminal screen. On supported terminals, also clears scrollback.
 */
export const clearTerminal = getClearTerminalSequence();
