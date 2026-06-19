import * as React from 'react';
import { MessageResponse } from '../components/MessageResponse.js';
import { OffscreenFreeze } from '../components/OffscreenFreeze.js';
import { Box, Text } from '../ink.js';
import type { ProcessPeerProgress } from '../types/tools.js';

// Show more lines for a smoother terminal scrolling effect.
// 16 looked jerky; 32 gives a proper scroll-back feel.
const TERMINAL_OUTPUT_MAX_LINES = 32;

export function normalizeProcessPeerMode(
  mode: 'exec' | 'pty' | string | undefined,
  defaultMode: 'exec' | 'pty',
): 'exec' | 'pty' {
  const requestedMode = mode === 'exec' || mode === 'pty' ? mode : defaultMode;
  return process.platform === 'win32' && requestedMode === 'pty' ? 'exec' : requestedMode;
}

export function renderProcessPeerTerminal(options: {
  latest: ProcessPeerProgress | undefined;
  defaultProvider: string;
  defaultMode: 'exec' | 'pty';
  title: string;
}): React.ReactNode {
  const { latest, defaultProvider, defaultMode, title } = options;
  const provider = latest?.provider ?? defaultProvider;
  const mode = latest?.mode ?? defaultMode;
  const elapsed = latest ? `${(latest.elapsedMs / 1000).toFixed(1)}s` : '0.0s';
  const status = latest?.status ?? 'starting';
  const command = latest?.displayCommand ?? latest?.command ?? `${provider} ${mode}`;
  // Truncate the command display to the first N chars + '…' to keep the terminal clean.
  // The full command is visible in the header bar on hover.
  const truncatedCommand = command.length > 120 ? `${command.slice(0, 120)}\u2026` : command;
  const outputLines = latest?.outputTail ? latest.outputTail.split(/\r?\n/).slice(-TERMINAL_OUTPUT_MAX_LINES) : [];
  const statusColor =
    status === 'complete' ? 'green' : status === 'failed' ? 'red' : status === 'running' ? 'cyan' : 'yellow';
  const promptColor = status === 'failed' ? 'red' : 'green';
  const cursor = status === 'running' ? React.createElement(Text, { color: 'cyan' }, '\u258C') : null;

  return React.createElement(
    MessageResponse,
    null,
    React.createElement(
      OffscreenFreeze,
      null,
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round',
          borderColor: statusColor,
          paddingX: 1,
          width: '100%',
        },
        // Title bar
        React.createElement(
          Box,
          { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
          React.createElement(Text, { bold: true }, title),
          React.createElement(Text, { color: statusColor }, `${status} | ${elapsed}`),
        ),
        // Command line
        React.createElement(
          Box,
          { flexDirection: 'row', marginTop: 1 },
          React.createElement(Text, { color: promptColor }, '$ '),
          React.createElement(Text, { color: promptColor, bold: true }, truncatedCommand),
        ),
        // Terminal output area — no inner border, just raw flowing text
        React.createElement(
          Box,
          { flexDirection: 'column', marginTop: 1, paddingX: 1 },
          outputLines.length > 0
            ? React.createElement(
                Box,
                { flexDirection: 'column' },
                ...outputLines.map((line, index) =>
                  React.createElement(Text, { key: `${index}:${line}`, wrap: 'wrap' }, line || '\u00A0'),
                ),
                cursor,
              )
            : React.createElement(Text, { dimColor: true }, `waiting for ${provider} output...`),
        ),
      ),
    ),
  );
}
