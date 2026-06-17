import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useTerminalViewport } from '../../ink/hooks/use-terminal-viewport.js';
import { Box, measureElement } from '../../ink.js';
export function Ratchet({ children, lock = 'always' }) {
  const [viewportRef, { isVisible }] = useTerminalViewport();
  const { rows } = useTerminalSize();
  const innerRef = useRef(null);
  const maxHeight = useRef(0);
  const [minHeight, setMinHeight] = useState(0);
  const outerRef = useCallback(
    el => {
      viewportRef(el);
    },
    [viewportRef],
  );
  const engaged = lock === 'always' || !isVisible;
  useLayoutEffect(() => {
    if (!innerRef.current) {
      return;
    }
    const { height } = measureElement(innerRef.current);
    if (height > maxHeight.current) {
      maxHeight.current = Math.min(height, rows);
      setMinHeight(maxHeight.current);
    }
  });
  return _jsx(Box, {
    minHeight: engaged ? minHeight : undefined,
    ref: outerRef,
    children: _jsx(Box, { ref: innerRef, flexDirection: 'column', children: children }),
  });
}
