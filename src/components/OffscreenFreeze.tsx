import type React from 'react';
import { useContext, useRef } from 'react';
import { useTerminalViewport } from '../ink/hooks/use-terminal-viewport.js';
import { Box } from '../ink.js';
import { InVirtualListContext } from './messageActions.js';

type Props = {
  children: React.ReactNode;
  freezeKey?: unknown;
};

/**
 * Freezes children when they scroll above the terminal viewport (into scrollback).
 *
 * Any content change above the viewport forces log-update.ts into a full terminal
 * reset (it cannot partially update rows that have scrolled out). For content that
 * updates on a timer — spinners, elapsed counters — this produces a reset per tick.
 *
 * When offscreen, returns the same ReactElement reference that was cached during
 * the last visible render. React's reconciler bails on identical element refs, so
 * the subtree never re-renders, producing zero diff.
 *
 * The cache is one slot deep: the first re-render after scrolling back into view
 * picks up the live children. Content still updates normally while visible.
 */
export function OffscreenFreeze({ children, freezeKey }: Props): React.ReactNode {
  // React Compiler: reading cached.current in the return is the entire
  // freeze mechanism — memoizing this component would defeat it. Opt out.
  'use no memo';

  const inVirtualList = useContext(InVirtualListContext);
  const [ref, { isVisible }] = useTerminalViewport();
  const cached = useRef(children);
  const cachedFreezeKey = useRef(freezeKey);
  if (cachedFreezeKey.current !== freezeKey) {
    cachedFreezeKey.current = freezeKey;
    cached.current = children;
  }
  // H26: When children type changes mid-session (e.g., tool result reclassified
  // as collapsed group), update cache immediately regardless of visibility to
  // prevent React reconciliation crash from stale element type refs.
  if (cached.current !== children) {
    const oldType =
      typeof cached.current === 'object' && cached.current !== null ? (cached.current as any)?.type : undefined;
    const newType = typeof children === 'object' && children !== null ? (children as any)?.type : undefined;
    if (oldType !== newType) {
      cached.current = children;
    }
  }
  // Virtual list has no terminal scrollback — the ScrollBox clips inside the
  // viewport, so there's nothing to freeze. Freezing there also blocks
  // click-to-expand since useTerminalViewport's visibility calc can disagree
  // with the ScrollBox's virtual scroll position.
  if (isVisible || inVirtualList) {
    cached.current = children;
  }
  return <Box ref={ref}>{cached.current}</Box>;
}
