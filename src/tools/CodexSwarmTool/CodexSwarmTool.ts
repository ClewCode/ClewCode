/**
 * CodexSwarmTool — dedicated tool for invoking the local Codex CLI.
 *
 * This is a focused wrapper around the Codex process runner. Unlike the generic
 * `process_peer` tool, this one is hardcoded to the `codex` provider and has
 * a description that tells the model exactly when to use it.
 */

import * as React from 'react';
import { z } from 'zod/v4';
import { MessageResponse } from '../../components/MessageResponse.js';
import { OffscreenFreeze } from '../../components/OffscreenFreeze.js';
import { Box, Text } from '../../ink.js';
import { createCodexExecPeerProvider, getProcessSwarmProviderIds } from '../../swarm/ProcessSwarmProvider.js';
import { buildTool, type ToolCallProgress } from '../../Tool.js';
import type { ProcessPeerProgress } from '../../types/tools.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { notifySwarmFeedback, truncateText } from '../swarm/swarmFeedback.js';

const DEFAULT_CODEX_PEER_MODE = 'pty' as const;
const TERMINAL_OUTPUT_MAX_LINES = 16;

const inputSchema = lazySchema(() =>
  z.object({
    prompt: z.string().describe('Task or message to send to Codex CLI'),
    mode: z
      .enum(['exec', 'pty'])
      .optional()
      .default(DEFAULT_CODEX_PEER_MODE)
      .describe('Execution mode. "pty" is the default terminal-style live view; "exec" is stable one-shot capture.'),
    cwd: z.string().optional().describe('Working directory for Codex. Defaults to the current Clew cwd.'),
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

export const CODEX_PEER_TOOL_NAME = 'codex_peer';

export const CodexSwarmTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  name: CODEX_PEER_TOOL_NAME,
  searchHint: 'delegate task to local Codex CLI',
  maxResultSizeChars: 30_000,
  async description() {
    return (
      'Run a local Codex CLI instance as a terminal-style worker and return its output. ' +
      'Use this when you want Codex to independently execute a subtask, review code, ' +
      'debug an issue, or implement a focused change. ' +
      'Defaults to PTY mode so progress appears as a live terminal panel; use `exec` only for one-shot capture. ' +
      'Your `prompt` is sent verbatim to Codex as its sole instruction. ' +
      'Available providers: ' +
      getProcessSwarmProviderIds().join(', ') +
      '.'
    );
  },
  async prompt() {
    return (
      'Runs a local Codex CLI process for one task and returns stdout/stderr. Defaults to PTY terminal mode. ' +
      'Use this when you want the local Codex CLI (not a Clew peer or /agent subagent) to handle a subtask independently. ' +
      'The prompt is sent verbatim — write self-contained instructions with context, ' +
      'expected output format, and working directory. ' +
      'Do NOT call this for simple file reads, searches, or questions you can answer directly. ' +
      'Reserve it for tasks that benefit from a separate Codex execution.'
    );
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
    return 'Codex CLI';
  },
  renderToolUseMessage(input: Partial<{ prompt?: string; cwd?: string; mode?: string }>) {
    return React.createElement(
      Text,
      null,
      `codex ${input.mode ?? DEFAULT_CODEX_PEER_MODE}${input.cwd ? ` in ${input.cwd}` : ''}: `,
      React.createElement(Text, { dimColor: true }, truncateText(input.prompt ?? '', 120)),
    );
  },
  renderToolUseProgressMessage(progressMessages): React.ReactNode {
    const latest = progressMessages.at(-1)?.data as ProcessPeerProgress | undefined;
    const mode = latest?.mode ?? DEFAULT_CODEX_PEER_MODE;
    const elapsed = latest ? `${(latest.elapsedMs / 1000).toFixed(1)}s` : '0.0s';
    const status = latest?.status ?? 'starting';
    const command = latest?.displayCommand ?? latest?.command ?? `codex ${mode}`;
    const outputLines = latest?.outputTail ? latest.outputTail.split(/\r?\n/).slice(-TERMINAL_OUTPUT_MAX_LINES) : [];
    const borderColor = status === 'complete' ? 'green' : status === 'running' ? 'cyan' : 'yellow';
    const statusColor = status === 'complete' ? 'green' : status === 'running' ? 'cyan' : 'yellow';

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
            borderColor,
            paddingX: 1,
            width: '100%',
          },
          React.createElement(
            Box,
            { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
            React.createElement(Text, { bold: true }, 'Codex CLI terminal'),
            React.createElement(Text, { color: statusColor }, `${status} | ${mode} | ${elapsed}`),
          ),
          latest?.cwd
            ? React.createElement(Text, { dimColor: true, wrap: 'truncate-end' }, `cwd: ${latest.cwd}`)
            : null,
          React.createElement(Text, { dimColor: true, wrap: 'truncate-end' }, `$ ${command}`),
          React.createElement(
            Box,
            { borderStyle: 'single', borderColor: 'gray', flexDirection: 'column', marginTop: 1, paddingX: 1 },
            React.createElement(Text, { dimColor: true }, 'live output'),
            outputLines.length > 0
              ? React.createElement(
                  Box,
                  { flexDirection: 'column' },
                  ...outputLines.map((line, index) =>
                    React.createElement(Text, { key: `${index}:${line}`, wrap: 'truncate-end' }, line || '\u00A0'),
                  ),
                )
              : React.createElement(Text, { dimColor: true }, 'waiting for codex output...'),
          ),
        ),
      ),
    );
  },
  renderToolUseQueuedMessage(): React.ReactNode {
    return React.createElement(
      Box,
      { paddingLeft: 2 },
      React.createElement(Text, { dimColor: true }, 'Queued Codex CLI terminal'),
    );
  },
  getActivityDescription(input: Partial<{ prompt?: string; cwd?: string; mode?: string }>) {
    return `Running Codex CLI (${input.mode ?? DEFAULT_CODEX_PEER_MODE}): ${truncateText(input.prompt ?? '', 80)}`;
  },
  getToolUseSummary(input: Partial<{ prompt?: string; cwd?: string; mode?: string }>) {
    return `Codex ${input.mode ?? DEFAULT_CODEX_PEER_MODE}: ${truncateText(input.prompt ?? '', 80)}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (!output.success) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: `[codex_peer] Failed: ${output.error}`,
      };
    }

    const text = (output.stdout || '').trim() || output.stderr || '(empty)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        `[codex_peer] exit ${output.exitCode ?? output.signal ?? 'unknown'} in ${((output.durationMs ?? 0) / 1000).toFixed(1)}s`,
        '',
        text,
      ].join('\n'),
    };
  },
  async call(
    input: {
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
    const provider = createCodexExecPeerProvider();
    if (!provider) {
      return {
        data: {
          success: false,
          provider: 'codex',
          error: `Codex provider not available. Install Codex CLI or use a different provider.`,
        },
      };
    }

    try {
      const timeout = Math.min(Math.max(1, input.timeout ?? 600), 1800) * 1000;
      let progressSeq = 0;
      notifySwarmFeedback(`asking codex`, 'process-peer', 'low');
      const result = await provider.runTask({
        prompt: input.prompt,
        mode: input.mode ?? DEFAULT_CODEX_PEER_MODE,
        cwd: input.cwd ?? getCwd(),
        model: input.model,
        timeoutMs: timeout,
        onProgress: progress => {
          onProgress?.({
            toolUseID: `codex-peer-${++progressSeq}`,
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

      notifySwarmFeedback(
        `codex ${result.exitCode === 0 && !result.timedOut ? 'finished' : 'failed'} with exit ${
          result.exitCode ?? result.signal ?? 'unknown'
        }`,
        'process-peer-result',
        result.exitCode === 0 && !result.timedOut ? 'medium' : 'high',
      );

      return {
        data: {
          success: result.exitCode === 0 && !result.timedOut,
          provider: 'codex',
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
      notifySwarmFeedback(`failed: ${truncateText(error, 120)}`, 'process-peer-error', 'high');
      return {
        data: {
          success: false,
          provider: 'codex',
          error,
        },
      };
    }
  },
});
