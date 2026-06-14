import { jsx as _jsx } from "react/jsx-runtime";
import '../global.d.ts';
import * as warn from '../warn.js';
/**
 * `<Box>` is an essential Ink component to build your layout. It's like `<div style="display: flex">` in the browser.
 */
function Box({ children, flexWrap = 'nowrap', flexDirection = 'row', flexGrow = 0, flexShrink = 1, ref, tabIndex, autoFocus, onClick, onFocus, onFocusCapture, onBlur, onBlurCapture, onMouseEnter, onMouseLeave, onKeyDown, onKeyDownCapture, ...style }) {
    // Warn if spacing values are not integers to prevent fractional layout dimensions
    warn.ifNotInteger(style.margin, 'margin');
    warn.ifNotInteger(style.marginX, 'marginX');
    warn.ifNotInteger(style.marginY, 'marginY');
    warn.ifNotInteger(style.marginTop, 'marginTop');
    warn.ifNotInteger(style.marginBottom, 'marginBottom');
    warn.ifNotInteger(style.marginLeft, 'marginLeft');
    warn.ifNotInteger(style.marginRight, 'marginRight');
    warn.ifNotInteger(style.padding, 'padding');
    warn.ifNotInteger(style.paddingX, 'paddingX');
    warn.ifNotInteger(style.paddingY, 'paddingY');
    warn.ifNotInteger(style.paddingTop, 'paddingTop');
    warn.ifNotInteger(style.paddingBottom, 'paddingBottom');
    warn.ifNotInteger(style.paddingLeft, 'paddingLeft');
    warn.ifNotInteger(style.paddingRight, 'paddingRight');
    warn.ifNotInteger(style.gap, 'gap');
    warn.ifNotInteger(style.columnGap, 'columnGap');
    warn.ifNotInteger(style.rowGap, 'rowGap');
    return (_jsx("ink-box", { ref: ref, tabIndex: tabIndex, autoFocus: autoFocus, onClick: onClick, onFocus: onFocus, onFocusCapture: onFocusCapture, onBlur: onBlur, onBlurCapture: onBlurCapture, onMouseEnter: onMouseEnter, onMouseLeave: onMouseLeave, onKeyDown: onKeyDown, onKeyDownCapture: onKeyDownCapture, style: {
            flexWrap,
            flexDirection,
            flexGrow,
            flexShrink,
            ...style,
            overflowX: style.overflowX ?? style.overflow ?? 'visible',
            overflowY: style.overflowY ?? style.overflow ?? 'visible',
        }, children: children }));
}
export default Box;
