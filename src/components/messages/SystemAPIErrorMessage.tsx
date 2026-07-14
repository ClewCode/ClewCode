import type * as React from 'react';
import { useState } from 'react';
import { Box, Text } from 'src/ink.js';
import { formatAPIError } from 'src/services/api/errorUtils.js';
import type { SystemAPIErrorMessage } from 'src/types/message.js';
import { useInterval } from 'usehooks-ts';
import { CtrlOToExpand } from '../CtrlOToExpand.js';
import { MessageResponse } from '../MessageResponse.js';

const MAX_API_ERROR_CHARS = 1000;

// Helpful tips surfaced while the user waits out a retry. Rotated by attempt so
// the message stays stable across the per-second countdown re-renders but a
// long backoff still shows variety.
const RETRY_TIPS = [
  "Use /btw to ask a quick side question without interrupting Claude's current work",
  'Press Esc to interrupt and try a different approach',
  'High API load usually clears within a minute — Claude will resume automatically',
];

type Props = {
  message: SystemAPIErrorMessage;
  verbose: boolean;
};

export function SystemAPIErrorMessage({
  message: { retryAttempt, error, retryInMs, maxRetries },
  verbose,
}: Props): React.ReactNode {
  // Hidden for the very first retry on external builds to avoid noise from
  // transient one-off blips, but surface sustained errors quickly (a silent
  // spinner for 4 attempts / ~20s reads as a hang). Compute before useInterval
  // so we never register a timer that just drives a null render.
  const hidden = retryAttempt < 2;

  const [countdownMs, setCountdownMs] = useState(0);
  const done = countdownMs >= retryInMs;
  useInterval(() => setCountdownMs(ms => ms + 1000), hidden || done ? null : 1000);

  if (hidden) {
    return null;
  }

  const retryInSecondsLive = Math.max(0, Math.round((retryInMs - countdownMs) / 1000));

  const formatted = formatAPIError(error);
  const truncated = !verbose && formatted.length > MAX_API_ERROR_CHARS;
  const tip = RETRY_TIPS[(retryAttempt - 1) % RETRY_TIPS.length];

  return (
    <Box flexDirection="column">
      {/* Compact status line, flush-left (no ⎿ gutter) */}
      <Box>
        <Text color="claude">✳ </Text>
        <Text bold color="error">
          API error
        </Text>
        <Text dimColor>
          {' · '}
          {retryInSecondsLive > 0 ? `Retrying in ${retryInSecondsLive}s` : 'Retrying…'}
          {' · '}
          attempt {retryAttempt}/{maxRetries}
          {process.env.API_TIMEOUT_MS ? ` · API_TIMEOUT_MS=${process.env.API_TIMEOUT_MS}ms, try increasing it` : ''}
        </Text>
      </Box>

      {/* Full error detail only when verbose; otherwise offer Ctrl+O to expand */}
      {verbose && <Text color="error">{truncated ? `${formatted.slice(0, MAX_API_ERROR_CHARS)}…` : formatted}</Text>}
      {!verbose && formatted.length > 0 && <CtrlOToExpand />}

      {/* Indented tip (MessageResponse supplies the ⎿ gutter) */}
      <MessageResponse>
        <Text dimColor>Tip: {tip}</Text>
      </MessageResponse>
    </Box>
  );
}
