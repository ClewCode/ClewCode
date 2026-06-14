/**
 * Fallback UI for terminals with limited ANSI/VT escape sequence support.
 *
 * On legacy Windows consoles (conhost.exe) or when running in non-TTY mode,
 * some ANSI escape sequences used by Ink for styling are not supported or
 * render as garbage. This module strips unsupported sequences and provides
 * simplified text output.
 */

import { isLegacyConsole, supportsAnsiEscapeSequences } from '../utils/windowsTerminal.js';

// Regex matching common ANSI escape sequences
// Matches: colors (SGR), cursor movement, erase, scroll, DEC sequences, OSC sequences
const ANSI_ESCAPE_REGEX = /\u001B\[[\d;]*[a-zA-Z]|\u001B\][\d;]*[^\u0007\u001B]*(\u0007|\u001B\\)|\u001B[PX^_].*?\u001B\\/g;

// SGR (Select Graphic Rendition) sequences that set text styles — these are
// SAFE to preserve on most terminals. Matches \e[<params>m sequences.
const SGR_REGEX = /\u001B\[[\d;]*m/g;

/**
 * Whether the terminal needs ANSI escape sequence stripping.
 * True on legacy Windows consoles without ConPTY support.
 */
export function needsAnsiStripping(): boolean {
  return isLegacyConsole() || !process.stdout.isTTY;
}

/**
 * Strip all ANSI escape sequences from a string.
 * Removes colors, cursor movement, and other control sequences.
 *
 * @param text - The text containing ANSI escape sequences
 * @returns Plain text with ANSI sequences removed
 */
export function stripAnsiSequences(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, '');
}

/**
 * Strip ANSI sequences but preserve SGR color/style sequences.
 * Use this for terminals that support basic colors but not cursor
 * movement or other control sequences.
 *
 * @param text - The text containing ANSI escape sequences
 * @returns Text with non-style ANSI sequences removed
 */
export function stripNonStyleAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, match => (SGR_REGEX.test(match) ? match : ''));
}

/**
 * Process text for terminal output, applying any necessary transformations
 * based on terminal capabilities.
 *
 * - On legacy Windows consoles: strips ALL ANSI sequences
 * - On full-featured terminals: returns text unchanged
 *
 * @param text - The text to process
 * @param preserveStyles - If true, preserves color/style SGR sequences
 * @returns Processed text suitable for the current terminal
 */
export function processForTerminal(text: string, preserveStyles = false): string {
  if (!needsAnsiStripping()) {
    return text;
  }

  return preserveStyles ? stripNonStyleAnsi(text) : stripAnsiSequences(text);
}

/**
 * Wrap a terminal output write function with ANSI stripping for
 * legacy Windows consoles.
 *
 * @param writeFn - The original write function (e.g., stdout.write)
 * @returns Wrapped function that strips ANSI when needed
 */
export function wrapTerminalOutput(
  writeFn: (chunk: string | Uint8Array, ...args: unknown[]) => unknown,
): (chunk: string | Uint8Array, ...args: unknown[]) => unknown {
  if (!needsAnsiStripping()) {
    return writeFn;
  }

  return (chunk: string | Uint8Array, ...args: unknown[]) => {
    if (typeof chunk === 'string') {
      return writeFn(processForTerminal(chunk), ...args);
    }
    // Buffer/Uint8Array — decode, strip, re-encode
    const str = Buffer.from(chunk).toString('utf8');
    const stripped = processForTerminal(str);
    return writeFn(Buffer.from(stripped, 'utf8'), ...args);
  };
}
