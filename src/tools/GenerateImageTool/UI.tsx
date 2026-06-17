import type React from 'react';
import { Box, Text } from '../../ink.js';
import type { Output } from './GenerateImageTool.js';

export function renderToolUseMessage(
  { prompt, size, quality, style }: Partial<Output>,
  _opts: { verbose: boolean },
): React.ReactNode {
  if (!prompt) return null;
  let msg = `"${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"`;
  const flags = [size && size !== '1024x1024' ? size : null, quality, style].filter(Boolean);
  if (flags.length > 0) msg += ` (${flags.join(', ')})`;
  return msg;
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  return (
    <Box flexDirection="column">
      {output.localPath ? <Text>Saved to: {output.localPath}</Text> : <Text>URL: {output.url}</Text>}
      {output.revised_prompt && <Text dimColor>Prompt: {output.revised_prompt.slice(0, 200)}</Text>}
    </Box>
  );
}

export function getToolUseSummary(input: Partial<Output>): string {
  if (!input.prompt) return '';
  return input.prompt.slice(0, 60);
}
