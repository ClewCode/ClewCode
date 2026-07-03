import type * as React from 'react';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import type { ThemeName } from '../../utils/theme.js';
import type { Output } from './ProjectRuleTool.js';

export function renderToolUseMessage(): React.ReactNode {
  return (
    <Box flexDirection="row">
      <Text dimColor>Managing project rules...</Text>
    </Box>
  );
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  _options: { theme: ThemeName },
): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text>{output.message}</Text>
      </Box>
      {output.rules && output.rules.length > 0 && (
        <Box paddingLeft={2} marginTop={1}>
          <Text dimColor>{output.rules.length} rule(s) active</Text>
        </Box>
      )}
    </Box>
  );
}
