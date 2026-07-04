import stripAnsi from 'strip-ansi';
import { OSC, osc, wrapForMultiplexer } from '../ink/termio/osc.js';
export const DEFAULT_TERMINAL_TITLE = 'Clew Code';
function shouldEmitTerminalTitleOsc() {
  if (process.platform !== 'win32') return true;
  return Boolean(
    process.env.WT_SESSION ||
      process.env.TERM_PROGRAM === 'vscode' ||
      process.env.ConEmuANSI === 'ON' ||
      process.env.TERM?.startsWith('xterm'),
  );
}
function sanitizeTerminalTitle(title) {
  return Array.from(stripAnsi(title), char => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  })
    .join('')
    .trim();
}
export function setTerminalTitle(title, writeRaw) {
  const clean = sanitizeTerminalTitle(title);
  if (!clean) return;
  process.title = clean;
  if (!shouldEmitTerminalTitleOsc()) return;
  const sequence = wrapForMultiplexer(osc(OSC.SET_TITLE_AND_ICON, clean));
  if (writeRaw) {
    writeRaw(sequence);
  } else if (process.stdout.isTTY) {
    process.stdout.write(sequence);
  }
}
