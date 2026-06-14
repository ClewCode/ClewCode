import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { useContext } from 'react';
import { Box, NoSelect, Text } from '../ink.js';
import { Ratchet } from './design-system/Ratchet.js';
export function MessageResponse({ children, height }) {
    const isMessageResponse = useContext(MessageResponseContext);
    if (isMessageResponse) {
        return children;
    }
    const content = (_jsx(MessageResponseProvider, { children: _jsxs(Box, { flexDirection: "row", height: height, overflowY: "hidden", children: [_jsx(NoSelect, { fromLeftEdge: true, flexShrink: 0, children: _jsxs(Text, { dimColor: true, children: ['  ', "\u23BF \u00A0"] }) }), _jsx(Box, { flexShrink: 1, flexGrow: 1, children: children })] }) }));
    if (height !== undefined) {
        return content;
    }
    return _jsx(Ratchet, { lock: "offscreen", children: content });
}
// This is a context that is used to determine if the message response
// is rendered as a descendant of another MessageResponse. We use it
// to avoid rendering nested ⎿ characters.
const MessageResponseContext = React.createContext(false);
function MessageResponseProvider({ children }) {
    return _jsx(MessageResponseContext.Provider, { value: true, children: children });
}
