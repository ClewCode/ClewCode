import { useCallback, useEffect, useRef, useState } from 'react';
import type { JumpHandle } from '../../components/VirtualMessageList.js';
import { useSearchHighlight } from '../../ink/hooks/use-search-highlight.js';
import { useInput } from '../../ink.js';

type Params = {
  active: boolean;
  virtualScrollActive: boolean;
  dumpMode: boolean;
  columns: number;
};

export function useTranscriptSearch({ active, virtualScrollActive, dumpMode, columns }: Params) {
  const jumpRef = useRef<JumpHandle | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);
  const [searchCurrent, setSearchCurrent] = useState(0);
  const { setQuery: setHighlight, scanElement, setPositions } = useSearchHighlight();

  const onSearchMatchesChange = useCallback((count: number, current: number) => {
    setSearchCount(count);
    setSearchCurrent(current);
  }, []);

  useInput(
    (input, key, event) => {
      if (key.ctrl || key.meta) return;
      if (input === '/') {
        jumpRef.current?.setAnchor();
        setSearchOpen(true);
        event.stopImmediatePropagation();
        return;
      }
      const c = input[0];
      if ((c === 'n' || c === 'N') && input === c.repeat(input.length) && searchCount > 0) {
        const fn = c === 'n' ? jumpRef.current?.nextMatch : jumpRef.current?.prevMatch;
        if (fn) for (let i = 0; i < input.length; i++) fn();
        event.stopImmediatePropagation();
      }
    },
    { isActive: active && virtualScrollActive && !searchOpen && !dumpMode },
  );

  const previousColumns = useRef(columns);
  useEffect(() => {
    if (previousColumns.current === columns) return;
    previousColumns.current = columns;
    if (searchQuery || searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
      setSearchCount(0);
      setSearchCurrent(0);
      jumpRef.current?.disarmSearch();
      setHighlight('');
    }
  }, [columns, searchOpen, searchQuery, setHighlight]);

  return {
    jumpRef,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchCount,
    setSearchCount,
    searchCurrent,
    setSearchCurrent,
    onSearchMatchesChange,
    setHighlight,
    scanElement,
    setPositions,
  };
}
