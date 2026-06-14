import { jsx as _jsx } from "react/jsx-runtime";
import Box from '../../ink/components/Box.js';
import { getTheme } from '../../utils/theme.js';
import { useTheme } from './ThemeProvider.js';
/**
 * Resolves a color value that may be a theme key to a raw Color.
 */
function resolveColor(color, theme) {
    if (!color)
        return undefined;
    // Check if it's a raw color (starts with rgb(, #, ansi256(, or ansi:)
    if (color.startsWith('rgb(') || color.startsWith('#') || color.startsWith('ansi256(') || color.startsWith('ansi:')) {
        return color;
    }
    // It's a theme key - resolve it
    return theme[color];
}
/**
 * Theme-aware Box component that resolves theme color keys to raw colors.
 * This wraps the base Box component with theme resolution for border colors.
 */
function ThemedBox({ borderColor, borderTopColor, borderBottomColor, borderLeftColor, borderRightColor, backgroundColor, children, ref, ...rest }) {
    const [themeName] = useTheme();
    const theme = getTheme(themeName);
    // Resolve theme keys to raw colors
    const resolvedBorderColor = resolveColor(borderColor, theme);
    const resolvedBorderTopColor = resolveColor(borderTopColor, theme);
    const resolvedBorderBottomColor = resolveColor(borderBottomColor, theme);
    const resolvedBorderLeftColor = resolveColor(borderLeftColor, theme);
    const resolvedBorderRightColor = resolveColor(borderRightColor, theme);
    const resolvedBackgroundColor = resolveColor(backgroundColor, theme);
    return (_jsx(Box, { ref: ref, borderColor: resolvedBorderColor, borderTopColor: resolvedBorderTopColor, borderBottomColor: resolvedBorderBottomColor, borderLeftColor: resolvedBorderLeftColor, borderRightColor: resolvedBorderRightColor, backgroundColor: resolvedBackgroundColor, ...rest, children: children }));
}
export default ThemedBox;
