import { jsx as _jsx } from "react/jsx-runtime";
import { supportsHyperlinks } from '../supports-hyperlinks.js';
import Text from './Text.js';
export default function Link({ children, url, fallback }) {
    // Use children if provided, otherwise display the URL
    const content = children ?? url;
    if (supportsHyperlinks()) {
        // Wrap in Text to ensure we're in a text context
        // (ink-link is a text element like ink-text)
        return (_jsx(Text, { children: _jsx("ink-link", { href: url, children: content }) }));
    }
    return _jsx(Text, { children: fallback ?? content });
}
