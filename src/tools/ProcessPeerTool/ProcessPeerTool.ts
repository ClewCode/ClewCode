import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { OffscreenFreeze } from '../../components/OffscreenFreeze.js';
import { Box, Text } from '../../ink.js';
import { getProcessPeerProvider, getProcessPeerProviderIds } from '../../peer/ProcessPeerProvider.js';
import { buildTool, type ToolCallProgress } from '../../Tool.js';
import type { ProcessPeerProgress } from '../../types/tools.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifyPeerFeedback, truncateText } from '../peer/peerFeedback.js';
import { DESCRIPTION, PROCESS_PEER_TOOL_NAME, PROMPT } from './prompt.js';

const inputSchema = lazySchema(() =>
  z.object({
    provider: z
      .enum(['codex'])
      .optional()
      .default('codex')
      .describe(`Process peer provider to run. Available: ${getProcessPeerProviderIds().join(', ')}`),
    prompt: z.string().describe('Task or message to send to the process peer'),
    mode: z
      .enum(['exec', 'pty'])
      .optional()
      .default('exec')
      .describe(
        'Execution mode. "exec" is stable one-shot capture; "pty" runs through a pseudo-terminal with live output.',
      ),
    cwd: z.string().optional().describe('Working directory for the peer task. Defaults to the current Clew cwd.'),
    model: z.string().optional().describe('Optional model override for providers that support it.'),
    timeout: z.number().optional().default(600).describe('Max execution time in seconds (default: 600, max: 1800).'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    provider: z.string(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().nullable().optional(),
    signal: z.string().nullable().optional(),
    timedOut: z.boolean().optional(),
    durationMs: z.number().optional(),
    error: z.string().optional(),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

const TERMINAL_OUTPUT_MAX_LINES = 16;

export const ProcessPeerTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  name: PROCESS_PEER_TOOL_NAME,
  searchHint: 'delegate task to local Codex peer',
  maxResultSizeChars: 30_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  get inputSchema() {
    return inputSchema();
  },
  get outputSchema() {
    return outputSchema();
  },
  getPath(input: { cwd?: string }) {
    return input.cwd ?? getCwd();
  },
  userFacingName() {
    return 'Process peer';
  },
  renderToolUseMessage(input: Partial<{ provider?: string; prompt?: string; cwd?: string; mode?: string }>) {
    return React.createElement(
      Text,
      null,
      `${input.provider ?? 'codex'} ${input.mode ?? 'exec'}${input.cwd ? ` in ${input.cwd}` : ''}: `,
      React.createElement(Text, { dimColor: true }, truncateText(input.prompt ?? '', 120)),
    );
  },
  renderToolUseProgressMessage(progressMessages): React.ReactNode {
    const latest = progressMessages.at(-1)?.data as ProcessPeerProgress | undefined;
    const provider = latest?.provider ?? 'codex';
    const mode = latest?.mode ?? 'exec';
    const elapsed = latest ? ` · ${(latest.elapsedMs / 1000).toFixed(1)}s` : '';
    const status = latest?.status ?? 'starting';
    const command = latest?.displayCommand ?? latest?.command ?? `${provider} ${mode}`;
    const outputLines = latest?.outputTail ? latest.outputTail.split(/\r?\n/).slice(-TERMINAL_OUTPUT_MAX_LINES) : [];

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
            borderStyle: 'single',
            borderColor: 'cyan',
            paddingX: 1,
            width: '100%',
          },
          React.createElement(
            Box,
            { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
            React.createElement(Text, { bold: true }, `${provider} ${mode}`),
            React.createElement(Text, { dimColor: true }, `${status}${elapsed}`),
          ),
          React.createElement(Text, { dimColor: true, wrap: 'truncate-end' }, `$ ${command}`),
          latest?.cwd
            ? React.createElement(Text, { dimColor: true, wrap: 'truncate-end' }, `cwd: ${latest.cwd}`)
            : null,
          outputLines.length > 0
            ? React.createElement(
                Box,
                { flexDirection: 'column', marginTop: 1 },
                ...outputLines.map((line, index) =>
                  React.createElement(Text, { key: index, wrap: 'truncate-end' }, line || '\u00A0'),
                ),
              )
            : React.createElement(Text, { dimColor: true }, `waiting for ${provider} output...`),
        ),
      ),
    );
  },
  renderToolUseQueuedMessage(): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2 },
      React.createElement(Text, { dimColor: true }, 'Queued local process peer'),
    );
  },
  getActivityDescription(input: Partial<{ provider?: string; prompt?: string; mode?: string }>) {
    return `Asking ${input.provider ?? 'process peer'} (${input.mode ?? 'exec'}): ${truncateText(input.prompt ?? '', 80)}`;
  },
  getToolUseSummary(input: Partial<{ provider?: string; prompt?: string; mode?: string }>) {
    return `${input.provider ?? 'process peer'} ${input.mode ?? 'exec'}: ${truncateText(input.prompt ?? '', 80)}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `[Process peer:${output.provider}] Failed: ${output.error}`,
      };
    }

    const text = (output.stdout || '').trim() || output.stderr || '(empty)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        `[Process peer:${output.provider}] exit ${output.exitCode ?? output.signal ?? 'unknown'} in ${(
          (output.durationMs ?? 0) / 1000
        ).toFixed(1)}s`,
        '',
        text,
      ].join('\n'),
    };
  },
  async call(
    input: {
      provider?: 'codex';
      prompt: string;
      mode?: 'exec' | 'pty';
      cwd?: string;
      model?: string;
      timeout?: number;
    },
    _context,
    _canUseTool,
    _parentMessage,
    onProgress?: ToolCallProgress<ProcessPeerProgress>,
  ) {
    const providerId = input.provider ?? 'codex';
    const provider = getProcessPeerProvider(providerId);
    if (!provider) {
      return {
        data: {
          success: false,
          provider: providerId,
          error: `Unknown process peer "${providerId}". Available: ${getProcessPeerProviderIds().join(', ')}`,
        },
      };
    }

    try {
      const timeout = Math.min(Math.max(1, input.timeout ?? 600), 1800) * 1000;
      let progressSeq = 0;
      notifyPeerFeedback(`asking ${provider.label}`, 'process-peer', 'low');
      const result = await provider.runTask({
        prompt: input.prompt,
        mode: input.mode ?? 'exec',
        cwd: input.cwd ?? getCwd(),
        model: input.model,
        timeoutMs: timeout,
        onProgress: progress => {
          onProgress?.({
            toolUseID: `process-peer-${++progressSeq}`,
            data: {
              type: 'process_peer',
              provider: progress.providerId,
              mode: progress.mode,
              command: progress.command,
              displayCommand: progress.displayCommand,
              cwd: progress.cwd,
              elapsedMs: progress.elapsedMs,
              outputTail: progress.outputTail,
              status: progress.status,
            },
          });
        },
      });

      notifyPeerFeedback(
        `${provider.label} ${result.exitCode === 0 && !result.timedOut ? 'finished' : 'failed'} with exit ${
          result.exitCode ?? result.signal ?? 'unknown'
        }`,
        'process-peer-result',
        result.exitCode === 0 && !result.timedOut ? 'medium' : 'high',
      );

      return {
        data: {
          success: result.exitCode === 0 && !result.timedOut,
          provider: providerId,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
        },
      };
    } catch (err) {
      const error = errorMessage(err);
      notifyPeerFeedback(`failed: ${truncateText(error, 120)}`, 'process-peer-error', 'high');
      return {
        data: {
          success: false,
          provider: providerId,
          error,
        },
      };
    }
  },
});
