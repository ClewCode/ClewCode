import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

function FastToggle({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const fastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();
  React.useEffect(() => {
    const next = !fastMode;
    setAppState(prev => ({ ...prev, fastMode: next }));
    onDone(next ? 'Fast Mode: On — faster and more concise for all providers' : 'Fast Mode: Off');
  }, [fastMode, setAppState, onDone]);
  return (
    <Box>
      <Text dimColor>Toggling Fast Mode...</Text>
    </Box>
  );
}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <FastToggle onDone={onDone} />;
}
