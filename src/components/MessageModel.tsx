import type React from 'react';
import { stringWidth } from '../ink/stringWidth.js';
import { Box, Text } from '../ink.js';
import { PROVIDER_REGISTRY } from '../services/ai/providerRegistry.js';
import type { NormalizedMessage } from '../types/message.js';

type Props = {
  message: NormalizedMessage;
  isTranscriptMode: boolean;
};

export function MessageModel({ message, isTranscriptMode }: Props): React.ReactNode {
  const shouldShowModel =
    isTranscriptMode &&
    message.type === 'assistant' &&
    message.message.model &&
    message.message.content.some(c => c.type === 'text');

  if (!shouldShowModel) {
    return null;
  }

  // Provider ID is injected at runtime in claude.ts (both Anthropic and OpenAI-compatible paths)
  // but is not part of the static type definition, so we access it via `as any`.
  const providerId = (message.message as any).provider as string | undefined;
  const providerLabel = providerId ? PROVIDER_REGISTRY[providerId]?.label : undefined;
  const displayText = providerLabel ? `${providerLabel} · ${message.message.model}` : message.message.model;

  return (
    <Box minWidth={stringWidth(displayText) + 8}>
      <Text dimColor>{displayText}</Text>
    </Box>
  );
}
