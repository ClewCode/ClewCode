import type React from 'react';
import type { Output } from './GenerateVideoTool.js';
import { Box, Text } from '../../ink.js';

export function renderToolUseMessage(
  { prompt }: Partial<Output>,
  _opts: { verbose: boolean },
): React.ReactNode {
  if (!prompt) return null;
  return `"${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`;
}

export function renderToolUseProgressMessage(): React.ReactNode {
  return <Text dimColor>Generating video (this may take 1-2 minutes)...</Text>;
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  return (
    <Box flexDirection="column">
      {output.localPath ? (
        <Text>Saved to: {output.localPath}</Text>
      ) : (
        <Text>URL: {output.url}</Text>
      )}
      {output.status && <Text dimColor>Status: {output.status}</Text>}
    </Box>
  );
}

export function getToolUseSummary(input: Partial<Output>): string {
  if (!input.prompt) return '';
  return input.prompt.slice(0, 60);
}
