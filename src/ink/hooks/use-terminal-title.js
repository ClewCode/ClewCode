import { useContext, useEffect } from 'react';
import { setTerminalTitle } from '../../utils/terminalTitle.js';
import { TerminalWriteContext } from '../useTerminalNotification.js';
/**
 * Declaratively set the terminal tab/window title.
 *
 * Pass a string to set the title. ANSI escape sequences are stripped
 * automatically so callers don't need to know about terminal encoding.
 * Pass `null` to opt out — the hook becomes a no-op and leaves the
 * terminal title untouched.
 *
 * Updates process.title and, when the terminal supports it, writes OSC 0
 * (set title+icon) via Ink's stdout.
 */
export function useTerminalTitle(title) {
  const writeRaw = useContext(TerminalWriteContext);
  useEffect(() => {
    if (title === null || !writeRaw) return;
    setTerminalTitle(title, writeRaw);
  }, [title, writeRaw]);
}
