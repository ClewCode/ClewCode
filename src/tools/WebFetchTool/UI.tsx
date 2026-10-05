import type React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { TOOL_SUMMARY_MAX_LENGTH } from '../../constants/toolLimits.js';
import { Box, Text } from '../../ink.js';
import type { ToolProgressData } from '../../Tool.js';
import type { ProgressMessage } from '../../types/message.js';
import { formatFileSize, truncate } from '../../utils/format.js';
import type { Output } from './WebFetchTool.js';
export function renderToolUseMessage(
  {
    url,
    urls,
    prompt,
  }: Partial<{
    url: string;
    urls: string[];
    prompt: string;
  }>,
  {
    verbose,
  }: {
    theme?: string;
    verbose: boolean;
  },
): React.ReactNode {
  if (!url && !urls?.length) {
    return null;
  }
  if (verbose) {
    return url
      ? `url: "${url}"${verbose && prompt ? `, prompt: "${prompt}"` : ''}`
      : `urls: ${urls!.map(u => `"${u}"`).join(', ')}${prompt ? `, prompt: "${prompt}"` : ''}`;
  }
  return url ?? `${urls!.length} URLs`;
}
export function renderToolUseProgressMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Fetching…</Text>
    </MessageResponse>
  );
}
export function renderToolResultMessage(
  { results, totalUrls, successful, failed }: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  {
    verbose,
  }: {
    verbose: boolean;
  },
): React.ReactNode {
  const totalBytes = results.reduce((sum, result) => sum + result.bytes, 0);
  const formattedSize = formatFileSize(totalBytes);
  const first = results[0];
  if (verbose) {
    return (
      <Box flexDirection="column">
        <MessageResponse height={1}>
          <Text>
            Fetched{' '}
            <Text bold>
              {successful}/{totalUrls}
            </Text>{' '}
            URL{totalUrls === 1 ? '' : 's'} ({formattedSize}
            {failed ? `, ${failed} failed` : ''})
          </Text>
        </MessageResponse>
        <Box flexDirection="column">
          {results.map(result => (
            <Text key={result.url}>{result.error ? `${result.url}: ${result.error}` : result.result}</Text>
          ))}
        </Box>
      </Box>
    );
  }
  return (
    <MessageResponse height={1}>
      <Text>
        {first?.error ? (
          <>Fetch failed: {first.error}</>
        ) : (
          <>
            Received <Text bold>{formattedSize}</Text>
            {first ? ` (${first.code} ${first.codeText})` : ''}
          </>
        )}
      </Text>
    </MessageResponse>
  );
}
export function getToolUseSummary(
  input:
    | Partial<{
        url: string;
        urls: string[];
        prompt: string;
      }>
    | undefined,
): string | null {
  if (input?.url) {
    return truncate(input.url, TOOL_SUMMARY_MAX_LENGTH);
  }
  if (input?.urls?.length) {
    return `${input.urls.length} URLs`;
  }
  return null;
}
