import { useCallback, useEffect, useRef, useState } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import Box from './Box.js';

function Button({ onAction, tabIndex = 0, autoFocus, children, ref, ...style }) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const activeTimer = useRef(null);
  useEffect(() => {
    return () => {
      if (activeTimer.current) clearTimeout(activeTimer.current);
    };
  }, []);
  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'return' || e.key === ' ') {
        e.preventDefault();
        setIsActive(true);
        onAction();
        if (activeTimer.current) clearTimeout(activeTimer.current);
        activeTimer.current = setTimeout(setter => setter(false), 100, setIsActive);
      }
    },
    [onAction],
  );
  const handleClick = useCallback(
    _e => {
      onAction();
    },
    [onAction],
  );
  const handleFocus = useCallback(_e => setIsFocused(true), []);
  const handleBlur = useCallback(_e => setIsFocused(false), []);
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);
  const state = {
    focused: isFocused,
    hovered: isHovered,
    active: isActive,
  };
  const content = typeof children === 'function' ? children(state) : children;
  return _jsx(Box, {
    ref: ref,
    tabIndex: tabIndex,
    autoFocus: autoFocus,
    onKeyDown: handleKeyDown,
    onClick: handleClick,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    ...style,
    children: content,
  });
}
export default Button;
