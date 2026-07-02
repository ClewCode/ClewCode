import type * as React from 'react';
import { Box, Text } from '../../ink.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { getLastCompactionCheckpointInfo } from '../../services/checkpoint/checkpointWriter.js';

/** Checkpoint info is relevant only if written for this boundary (moments ago). */
const CHECKPOINT_FRESHNESS_MS = 5 * 60_000;

export function CompactBoundaryMessage(): React.ReactNode {
  const historyShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
  const checkpoint = getLastCompactionCheckpointInfo();
  const showCheckpoint = checkpoint !== null && Date.now() - checkpoint.timestamp < CHECKPOINT_FRESHNESS_MS;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text dimColor>✻ Conversation compacted ({historyShortcut} for history)</Text>
      {showCheckpoint && (
        <Text dimColor>
          ✻ Checkpoint saved (cycle {checkpoint.cycle}) — {checkpoint.filesModified} file(s), {checkpoint.commandsRun}{' '}
          command(s) preserved
        </Text>
      )}
    </Box>
  );
}
