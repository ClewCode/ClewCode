import React, { useContext } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import Text from '../../ink/components/Text.js';
import { getTheme } from '../../utils/theme.js';
import { useTheme } from './ThemeProvider.js';
/** Colors uncolored ThemedText in the subtree. Precedence: explicit `color` >
 *  this > dimColor. Crosses Box boundaries (Ink's style cascade doesn't). */
export const TextHoverColorContext = React.createContext(undefined);
/**
 * Resolves a color value that may be a theme key to a raw Color.
 */
function resolveColor(color, theme) {
  if (!color) return undefined;
  // Check if it's a raw color (starts with rgb(, #, ansi256(, or ansi:)
  if (color.startsWith('rgb(') || color.startsWith('#') || color.startsWith('ansi256(') || color.startsWith('ansi:')) {
    return color;
  }
  // It's a theme key - resolve it
  return theme[color];
}
/**
 * Theme-aware Text component that resolves theme color keys to raw colors.
 * This wraps the base Text component with theme resolution.
 */
export default function ThemedText({
  color,
  backgroundColor,
  dimColor = false,
  bold = false,
  italic = false,
  underline = false,
  strikethrough = false,
  inverse = false,
  wrap = 'wrap',
  children,
}) {
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  const hoverColor = useContext(TextHoverColorContext);
  // Resolve theme keys to raw colors
  const resolvedColor =
    !color && hoverColor ? resolveColor(hoverColor, theme) : dimColor ? theme.inactive : resolveColor(color, theme);
  const resolvedBackgroundColor = resolveColor(backgroundColor, theme);
  return _jsx(Text, {
    color: resolvedColor,
    backgroundColor: resolvedBackgroundColor,
    bold: bold,
    italic: italic,
    underline: underline,
    strikethrough: strikethrough,
    inverse: inverse,
    wrap: wrap,
    children: children,
  });
}
