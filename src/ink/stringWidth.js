import emojiRegex from 'emoji-regex';
import { eastAsianWidth } from 'get-east-asian-width';
import stripAnsi from 'strip-ansi';
import { getGraphemeSegmenter } from '../utils/intl.js';

const EMOJI_REGEX = emojiRegex();
/**
 * Fallback JavaScript implementation of stringWidth when Bun.stringWidth is not available.
 *
 * Get the display width of a string as it would appear in a terminal.
 *
 * This is a more accurate alternative to the string-width package that correctly handles
 * characters like ⚠ (U+26A0) which string-width incorrectly reports as width 2.
 *
 * The implementation uses eastAsianWidth directly with ambiguousAsWide: false,
 * which correctly treats ambiguous-width characters as narrow (width 1) as
 * recommended by the Unicode standard for Western contexts.
 */
function stringWidthJavaScript(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return 0;
  }
  // Fast path: pure ASCII string (no ANSI codes, no wide chars)
  let isPureAscii = true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Check for non-ASCII or ANSI escape (0x1b)
    if (code >= 127 || code === 0x1b) {
      isPureAscii = false;
      break;
    }
  }
  if (isPureAscii) {
    // Count printable characters (exclude control chars)
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code > 0x1f) {
        width++;
      }
    }
    return width;
  }
  // Strip ANSI if escape character is present
  if (str.includes('\x1b')) {
    str = stripAnsi(str);
    if (str.length === 0) {
      return 0;
    }
  }
  // Fast path: simple Unicode (no emoji, variation selectors, or joiners)
  if (!needsSegmentation(str)) {
    let width = 0;
    for (const char of str) {
      const codePoint = char.codePointAt(0);
      if (!isZeroWidth(codePoint)) {
        width += eastAsianWidth(codePoint, { ambiguousAsWide: false });
      }
    }
    return width;
  }
  let width = 0;
  for (const { segment: grapheme } of getGraphemeSegmenter().segment(str)) {
    // Check for emoji first (most emoji sequences are width 2)
    EMOJI_REGEX.lastIndex = 0;
    if (EMOJI_REGEX.test(grapheme)) {
      width += getEmojiWidth(grapheme);
      continue;
    }
    // Calculate width for non-emoji graphemes
    // For complex-script graphemes (like Devanagari conjuncts), sum the widths
    // of all non-zero-width characters in the cluster. This matches terminal
    // behavior where each base consonant occupies a cell even when ligated.
    for (const char of grapheme) {
      const codePoint = char.codePointAt(0);
      if (!isZeroWidth(codePoint)) {
        width += eastAsianWidth(codePoint, { ambiguousAsWide: false });
      }
    }
  }
  return width;
}
function needsSegmentation(str) {
  for (const char of str) {
    const cp = char.codePointAt(0);
    // Emoji ranges
    if (cp >= 0x1f300 && cp <= 0x1faff) return true;
    if (cp >= 0x2600 && cp <= 0x27bf) return true;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
    // Variation selectors, ZWJ
    if (cp >= 0xfe00 && cp <= 0xfe0f) return true;
    if (cp === 0x200d) return true;
    // Indic, Thai, Lao ranges (scripts with combining marks/conjuncts)
    if (cp >= 0x0900 && cp <= 0x0d7f) return true;
    if (cp >= 0x0e00 && cp <= 0x0eff) return true;
  }
  return false;
}
function getEmojiWidth(grapheme) {
  // Regional indicators: single = 1, pair = 2
  const first = grapheme.codePointAt(0);
  if (first >= 0x1f1e6 && first <= 0x1f1ff) {
    let count = 0;
    for (const _ of grapheme) count++;
    return count === 1 ? 1 : 2;
  }
  // Incomplete keycap: digit/symbol + VS16 without U+20E3
  if (grapheme.length === 2) {
    const second = grapheme.codePointAt(1);
    if (second === 0xfe0f && ((first >= 0x30 && first <= 0x39) || first === 0x23 || first === 0x2a)) {
      return 1;
    }
  }
  return 2;
}
function isZeroWidth(codePoint) {
  // Fast path for common printable range
  if (codePoint >= 0x20 && codePoint < 0x7f) return false;
  if (codePoint >= 0xa0 && codePoint < 0x0300) return codePoint === 0x00ad;
  // Control characters
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  // Zero-width and invisible characters
  if (
    (codePoint >= 0x200b && codePoint <= 0x200d) || // ZW space/joiner
    codePoint === 0xfeff || // BOM
    (codePoint >= 0x2060 && codePoint <= 0x2064) // Word joiner etc.
  ) {
    return true;
  }
  // Variation selectors
  if ((codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)) {
    return true;
  }
  // Combining diacritical marks
  if (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return true;
  }
  // Indic script combining marks (covers Devanagari through Malayalam, plus others)
  if (codePoint >= 0x0900 && codePoint <= 0x0dff) {
    // Signs and vowel marks at start of each script block
    const offset = codePoint & 0x7f;
    if (offset <= 0x03) return true; // Combining signs (Candrabindu, Anusvara, Visarga)
    if (offset === 0x3c) return true; // Nukta
    if (offset >= 0x3e && offset <= 0x4d) return true; // Vowel signs + Virama / Halant
    if (offset >= 0x51 && offset <= 0x57) return true; // Stress signs / accents
    if (offset >= 0x62 && offset <= 0x63) return true; // Vowel signs
    if (offset >= 0x70 && offset <= 0x71) return true; // Signs
  }
  // Khmer combining marks
  if (codePoint >= 0x17b4 && codePoint <= 0x17d3) return true;
  // Myanmar combining marks
  if (
    (codePoint >= 0x102b && codePoint <= 0x103e) ||
    (codePoint >= 0x1056 && codePoint <= 0x1059) ||
    (codePoint >= 0x105e && codePoint <= 0x1060) ||
    (codePoint >= 0x1062 && codePoint <= 0x1064) ||
    (codePoint >= 0x1067 && codePoint <= 0x106d) ||
    (codePoint >= 0x1071 && codePoint <= 0x1074) ||
    (codePoint >= 0x1082 && codePoint <= 0x108d) ||
    codePoint === 0x108f ||
    (codePoint >= 0x109a && codePoint <= 0x109d)
  ) {
    return true;
  }
  // Thai/Lao combining marks
  // Note: U+0E32 (SARA AA), U+0E33 (SARA AM), U+0EB2, U+0EB3 are spacing vowels (width 1), not combining marks
  if (
    codePoint === 0x0e31 || // Thai MAI HAN-AKAT
    (codePoint >= 0x0e34 && codePoint <= 0x0e3a) || // Thai vowel signs (skip U+0E32, U+0E33)
    (codePoint >= 0x0e47 && codePoint <= 0x0e4e) || // Thai vowel signs and marks
    codePoint === 0x0eb1 || // Lao MAI KAN
    (codePoint >= 0x0eb4 && codePoint <= 0x0ebc) || // Lao vowel signs (skip U+0EB2, U+0EB3)
    (codePoint >= 0x0ec8 && codePoint <= 0x0ecd) // Lao tone marks
  ) {
    return true;
  }
  // Arabic formatting
  if (
    (codePoint >= 0x0600 && codePoint <= 0x0605) ||
    codePoint === 0x06dd ||
    codePoint === 0x070f ||
    codePoint === 0x08e2
  ) {
    return true;
  }
  // Surrogates, tag characters
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return true;
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return true;
  return false;
}
// Note: complex-script graphemes like Devanagari क्ष (ka+virama+ZWJ+ssa) render
// as a single ligature glyph but occupy 2 terminal cells (wcwidth sums the base
// consonants). Bun.stringWidth=2 matches terminal cell allocation, which is what
// we need for cursor positioning — the JS fallback's grapheme-cluster width of 1
// would desync Ink's layout from the terminal.
//
// Bun.stringWidth is resolved once at module scope rather than checked on every
// call — typeof guards deopt property access and this is a hot path (~100k calls/frame).
const bunStringWidth = typeof Bun !== 'undefined' && typeof Bun.stringWidth === 'function' ? Bun.stringWidth : null;
const BUN_STRING_WIDTH_OPTS = { ambiguousIsNarrow: true };
function needsJavaScriptWidth(str) {
  for (const char of str) {
    const cp = char.codePointAt(0);
    // Bun's native width path can drift from terminal behavior for scripts
    // with marks that attach to neighboring glyphs. Use our tuned fallback for
    // these ranges so cursor math stays aligned while typing Indic scripts.
    // Thai and Lao (0x0E00-0x0EFF) are removed to let Bun.stringWidth handle them
    // as it is often more accurate for platform-specific terminal behaviors.
    if (cp >= 0x0900 && cp <= 0x0dff) return true;
  }
  return false;
}
export const stringWidth = bunStringWidth
  ? str => (needsJavaScriptWidth(str) ? stringWidthJavaScript(str) : bunStringWidth(str, BUN_STRING_WIDTH_OPTS))
  : stringWidthJavaScript;
