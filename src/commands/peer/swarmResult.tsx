/**
 * SwarmResult — Ink component for displaying aggregated swarm execution results.
 */

import type * as React from 'react';
import { Box, Text } from '../../ink.js';

export type SwarmPeerResult = {
  peerId: string;
  hostname: string;
  status: 'success' | 'failed' | 'timeout';
  durationMs: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

export function SwarmResult({
  results,
  totalDurationMs,
  command,
}: {
  results: SwarmPeerResult[];
  totalDurationMs: number;
  command: string;
}): React.ReactNode {
  const successCount = results.filter(r => r.status === 'success').length;
  const totalCount = results.length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Swarm Results</Text>
        <Text dimColor>
          {' '}
          ({totalCount} peer{totalCount !== 1 ? 's' : ''}, {(totalDurationMs / 1000).toFixed(1)}s)
        </Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text dimColor>Command: {command}</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {results.map((r, i) => {
          const icon = r.status === 'success' ? '\u2713' : '\u2717';
          const color = r.status === 'success' ? 'ansi:green' : 'ansi:red';
          const duration = (r.durationMs / 1000).toFixed(1);
          const label = r.status === 'timeout' ? 'Timed out' : r.status === 'failed' ? 'Failed' : 'OK';
          const tag = r.error ? ` (${r.error})` : '';

          return (
            <Box key={r.peerId} flexDirection="column" marginBottom={i < results.length - 1 ? 1 : 0}>
              <Box flexDirection="row">
                <Text color={color}>
                  {icon} {r.hostname} ({label}, {duration}s)
                  {tag}
                </Text>
              </Box>

              {/* Only show stdout/stderr for successful peers */}
              {r.status === 'success' && r.stdout && (
                <Box marginLeft={2} marginTop={0}>
                  <Text dimColor>{truncateOutput(r.stdout, 50)}</Text>
                </Box>
              )}
              {r.status === 'success' && r.stderr && (
                <Box marginLeft={2}>
                  <Text color="ansi:yellow">{truncateOutput(r.stderr, 20)}</Text>
                </Box>
              )}
              {r.status === 'failed' && !r.error && r.stderr && (
                <Box marginLeft={2}>
                  <Text color="ansi:red">{truncateOutput(r.stderr, 30)}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box>
        <Text bold>
          {successCount}/{totalCount} peer{totalCount !== 1 ? 's' : ''} succeeded
        </Text>
      </Box>
    </Box>
  );
}

/** Truncate output to N lines for display */
function truncateOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}
