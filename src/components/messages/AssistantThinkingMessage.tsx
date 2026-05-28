import type { ThinkingBlock, ThinkingBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from '../../ink.js';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { Markdown } from '../Markdown.js';

/** Maximum lines of thinking content shown in collapsed (summary) mode */
const THINKING_SUMMARY_MAX_LINES = 10;

type Props = {
  // Accept either full ThinkingBlock/ThinkingBlockParam or a minimal shape with just type and thinking
  param: ThinkingBlock | ThinkingBlockParam | { type: 'thinking'; thinking: string };
  addMargin: boolean;
  isTranscriptMode: boolean;
  verbose: boolean;
  /** When true, hide this thinking block entirely (used for past thinking in transcript mode) */
  hideInTranscript?: boolean;
};

/**
 * Truncate thinking content to the first N lines for summary preview.
 * Each line is trimmed; blank trailing lines are stripped.
 */
function truncateThinkingLines(text: string, maxLines: number): string {
  const lines = text.split('\n');
  const taken: string[] = [];
  for (let i = 0; i < lines.length && taken.length < maxLines; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed || taken.length > 0) taken.push(trimmed);
  }
  // Strip trailing blank lines from the result
  while (taken.length > 0 && taken[taken.length - 1] === '') taken.pop();
  return taken.join('\n');
}

export function AssistantThinkingMessage({
  param: { thinking },
  addMargin = false,
  isTranscriptMode,
  verbose,
  hideInTranscript = false,
}: Props): React.ReactNode {
  if (!thinking) {
    return null;
  }

  if (hideInTranscript) {
    return null;
  }

  const shouldShowFullThinking = isTranscriptMode || verbose;
  const label = '∴ Thinking';

  if (!shouldShowFullThinking) {
    // Collapsed summary mode: show a markdown preview capped at 10 lines
    // with a Ctrl+O hint to view the full thinking block.
    const summary = useMemo(() => truncateThinkingLines(thinking, THINKING_SUMMARY_MAX_LINES), [thinking]);
    if (!summary) {
      // Empty after truncation (e.g. only whitespace) — fall back to label
      return (
        <Box marginTop={addMargin ? 1 : 0}>
          <Text dimColor italic>
            {label} <CtrlOToExpand />
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1} marginTop={addMargin ? 1 : 0} width="100%">
        <Text dimColor italic>
          {label}
        </Text>
        <Box paddingLeft={2}>
          <Box marginBottom={1}>
            <Markdown dimColor>{summary}</Markdown>
          </Box>
        </Box>
        <Text dimColor italic>
          <CtrlOToExpand /> for full thinking
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} marginTop={addMargin ? 1 : 0} width="100%">
      <Text dimColor italic>
        {label}…
      </Text>
      <Box paddingLeft={2}>
        <Markdown dimColor>{thinking}</Markdown>
      </Box>
    </Box>
  );
}
