import figures from 'figures';
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';

export function TranscriptModeFooter({
  showAllInTranscript,
  virtualScroll,
  searchBadge,
  suppressShowAll = false,
  status,
}: {
  showAllInTranscript: boolean;
  virtualScroll: boolean;
  searchBadge?: { current: number; count: number };
  suppressShowAll?: boolean;
  status?: string;
}): React.ReactNode {
  const toggleShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
  const showAllShortcut = useShortcutDisplay('transcript:toggleShowAll', 'Transcript', 'ctrl+e');
  return (
    <Box
      noSelect
      alignItems="center"
      alignSelf="center"
      borderTopDimColor
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      marginTop={1}
      paddingLeft={2}
      width="100%"
    >
      <Text dimColor>
        Showing detailed transcript · {toggleShortcut} to toggle
        {searchBadge
          ? ' · n/N to navigate'
          : virtualScroll
            ? ` · ${figures.arrowUp}${figures.arrowDown} scroll · home/end top/bottom`
            : suppressShowAll
              ? ''
              : ` · ${showAllShortcut} to ${showAllInTranscript ? 'collapse' : 'show all'}`}
      </Text>
      {status ? (
        <>
          <Box flexGrow={1} />
          <Text>{status} </Text>
        </>
      ) : searchBadge ? (
        <>
          <Box flexGrow={1} />
          <Text dimColor>
            {searchBadge.current}/{searchBadge.count}
            {'  '}
          </Text>
        </>
      ) : null}
    </Box>
  );
}
