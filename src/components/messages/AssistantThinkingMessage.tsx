import type { ThinkingBlock, ThinkingBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type React from 'react';
import { useState } from 'react';
import { useInterval } from 'usehooks-ts';
import { Box, Text } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { Markdown } from '../Markdown.js';

const THINKING_SPINNER_FRAMES = ['∴', '∵', '∷', '∺', '∵'];

type Props = {
  // Accept either full ThinkingBlock/ThinkingBlockParam or a minimal shape with just type and thinking
  param: ThinkingBlock | ThinkingBlockParam | { type: 'thinking'; thinking: string };
  addMargin: boolean;
  isTranscriptMode: boolean;
  verbose: boolean;
  /** When true, hide this thinking block entirely (used for past thinking in transcript mode) */
  hideInTranscript?: boolean;
  /** Whether thinking is actively streaming in real-time */
  isStreaming?: boolean;
};

export function hasThinkingBufferContent(thinking: string): boolean {
  return thinking.trim().length > 0;
}

export function getCollapsedThinkingPreview(thinking: string): string | null {
  const lines = thinking.split('\n');
  if (thinking.length < 150 && lines.length < 3) return null;

  const summaryLines = lines.slice(0, 10);
  const hasMore = lines.length > 10 || thinking.length > 1000;
  return summaryLines.join('\n') + (hasMore ? '\n...' : '');
}

export function AssistantThinkingMessage({
  param: { thinking },
  addMargin = false,
  isTranscriptMode,
  verbose,
  hideInTranscript = false,
  isStreaming = false,
}: Props): React.ReactNode {
  const showThinkingPreview = useAppState(s => s.showThinkingPreview ?? true);
  const [frame, setFrame] = useState(0);
  const hasBufferContent = hasThinkingBufferContent(thinking);

  useInterval(
    () => setFrame(f => (f + 1) % THINKING_SPINNER_FRAMES.length),
    isStreaming && hasBufferContent ? 120 : null,
  );

  if (!hasBufferContent) {
    return null;
  }

  if (hideInTranscript) {
    return null;
  }

  const spinnerGlyph = isStreaming ? THINKING_SPINNER_FRAMES[frame] : '∴';
  const shouldShowFullThinking = isStreaming || isTranscriptMode || verbose;
  const label = `${spinnerGlyph} Thinking`;

  if (!shouldShowFullThinking) {
    if (!showThinkingPreview) {
      return (
        <Box marginTop={addMargin ? 1 : 0}>
          <Text dimColor italic>
            {label}… <CtrlOToExpand />
          </Text>
        </Box>
      );
    }

    const summaryText = getCollapsedThinkingPreview(thinking);

    if (summaryText) {
      return (
        <Box flexDirection="column" gap={0} marginTop={addMargin ? 1 : 0} width="100%">
          <Text dimColor italic>
            {label} <CtrlOToExpand />
          </Text>
          <Box paddingLeft={2} marginTop={0}>
            <Markdown dimColor>{summaryText}</Markdown>
          </Box>
        </Box>
      );
    }

    return null;
  }

  return (
    <Box flexDirection="column" gap={0} marginTop={addMargin ? 1 : 0} width="100%">
      <Text dimColor italic>
        {label}…
      </Text>
      <Box paddingLeft={2}>
        <Markdown dimColor>{thinking}</Markdown>
      </Box>
    </Box>
  );
}
