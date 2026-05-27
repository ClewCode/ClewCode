import type React from 'react';
import stripAnsi from 'strip-ansi';
import { Box, Text } from '../../ink.js';
import { formatFileSize } from '../../utils/format.js';
import { MessageResponse } from '../MessageResponse.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { ShellTimeDisplay } from './ShellTimeDisplay.js';

type Props = {
  output: string;
  fullOutput: string;
  elapsedTimeSeconds?: number;
  totalLines?: number;
  totalBytes?: number;
  timeoutMs?: number;
  taskId?: string;
  verbose: boolean;
};

export function ShellProgressMessage({
  output,
  fullOutput,
  elapsedTimeSeconds,
  totalLines,
  totalBytes,
  timeoutMs,
  verbose,
}: Props): React.ReactNode {
  const strippedFullOutput = stripAnsi(fullOutput.trim());
  const strippedOutput = stripAnsi(output.trim());
  // Count all lines (including empty/short) for accurate hidden count
  const totalRawLines = strippedFullOutput.split('\n').length;
  const displayRawLines = strippedOutput.split('\n');
  const displayLineCount = displayRawLines.length;
  const displayLines = verbose ? strippedFullOutput : displayRawLines.slice(-5).join('\n');

  // OffscreenFreeze: BashTool yields progress (elapsedTimeSeconds) every second.
  // If this line scrolls into scrollback, each tick forces a full terminal reset.
  // A foreground `sleep 600` on a 29-row terminal with 4000 rows of history
  // produced 507 resets over 10 minutes (go/ccshare/maxk-20260226-190348).
  if (!totalRawLines) {
    return (
      <MessageResponse>
        <OffscreenFreeze>
          <Text dimColor>Running… </Text>
          <ShellTimeDisplay elapsedTimeSeconds={elapsedTimeSeconds} timeoutMs={timeoutMs} />
        </OffscreenFreeze>
      </MessageResponse>
    );
  }

  const MAX_DISPLAY_LINES = 5;
  // Use actual (unfiltered) line counts so the hidden count matches.
  // totalLines comes from the caller and may be stale; totalRawLines is the
  // ground-truth count from the full output string.
  const effectiveTotalLines = totalLines ?? totalRawLines;
  const hiddenCount = Math.max(0, effectiveTotalLines - Math.min(displayLineCount, MAX_DISPLAY_LINES));
  let lineStatus = '';
  if (!verbose && totalBytes && totalLines) {
    lineStatus = `~${totalLines} lines`;
  } else if (!verbose && hiddenCount > 0) {
    lineStatus = `+${hiddenCount} lines`;
  }

  return (
    <MessageResponse>
      <OffscreenFreeze>
        <Box flexDirection="column">
          <Box height={verbose ? undefined : Math.min(MAX_DISPLAY_LINES, displayLineCount)} flexDirection="column" overflow="hidden">
            <Text dimColor>{displayLines}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            {lineStatus ? <Text dimColor>{lineStatus}</Text> : null}
            <ShellTimeDisplay elapsedTimeSeconds={elapsedTimeSeconds} timeoutMs={timeoutMs} />
            {totalBytes ? <Text dimColor>{formatFileSize(totalBytes)}</Text> : null}
          </Box>
        </Box>
      </OffscreenFreeze>
    </MessageResponse>
  );
}
