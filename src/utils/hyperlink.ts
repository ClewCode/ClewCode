import ansis from 'ansis';
import { supportsHyperlinks } from '../ink/supports-hyperlinks.js';

// OSC 8 hyperlink escape sequences
// Format: \e]8;;URL\e\\TEXT\e]8;;\e\\
// Using \x07 (BEL) as terminator which is more widely supported

type HyperlinkOptions = {
  supportsHyperlinks?: boolean;
};

/**
 * Generate a deterministic ID for a URL to group wrapped link segments.
 */
function getOsc8Id(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Create a clickable hyperlink using OSC 8 escape sequences.
 * Falls back to plain text if the terminal doesn't support hyperlinks.
 *
 * @param url - The URL to link to
 * @param content - Optional content to display as the link text (only when hyperlinks are supported).
 *                  If provided and hyperlinks are supported, this text is shown as a clickable link.
 *                  If hyperlinks are not supported, content is ignored and only the URL is shown.
 * @param options - Optional overrides for testing (supportsHyperlinks)
 */
export function createHyperlink(url: string, content?: string, options?: HyperlinkOptions): string {
  const hasSupport = options?.supportsHyperlinks ?? supportsHyperlinks();
  if (!hasSupport) {
    return url;
  }

  // Apply basic ANSI cyan color — wrap-ansi preserves this across line breaks.
  // RGB colors (like theme colors) are NOT preserved by wrap-ansi with OSC 8.
  // Cyan is readable on both light and dark terminal themes, unlike plain blue
  // which appears dark-navy and is hard to read on dark backgrounds.
  const displayText = content ?? url;
  const coloredText = ansis.cyan(displayText);

  // Use id parameter to help terminals group wrapped segments of the same link.
  // Format: \e]8;id=ID;URL\e\\TEXT\e]8;;\e\\
  const id = getOsc8Id(url);
  return `\x1b]8;id=${id};${url}\x07${coloredText}\x1b]8;;\x07`;
}
