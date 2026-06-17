import { createContext, useMemo, useSyncExternalStore } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import { getTerminalFocused, getTerminalFocusState, subscribeTerminalFocus } from '../terminal-focus-state.js';

const TerminalFocusContext = createContext({
  isTerminalFocused: true,
  terminalFocusState: 'unknown',
});
// eslint-disable-next-line custom-rules/no-top-level-side-effects
TerminalFocusContext.displayName = 'TerminalFocusContext';
// Separate component so App.tsx doesn't re-render on focus changes.
// Children are a stable prop reference, so they don't re-render either —
// only components that consume the context will re-render.
export function TerminalFocusProvider({ children }) {
  const isTerminalFocused = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocused);
  const terminalFocusState = useSyncExternalStore(subscribeTerminalFocus, getTerminalFocusState);
  const value = useMemo(() => ({ isTerminalFocused, terminalFocusState }), [isTerminalFocused, terminalFocusState]);
  return _jsx(TerminalFocusContext.Provider, { value: value, children: children });
}
export default TerminalFocusContext;
