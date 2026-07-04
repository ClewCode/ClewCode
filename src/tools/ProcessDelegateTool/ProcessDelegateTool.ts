import * as React from 'react';
import { z } from 'zod/v4';
import { Text } from '../../ink.js';
import { getExecAgentProvider, getExecAgentProviderIds } from '../../peer/ProcessDelegateProvider.js';
import { buildTool, type ToolCallProgress } from '../../Tool.js';
import type { ExecAgentProgress } from '../../types/tools.js';
import { getCwd } from '../../utils/cwd.js';
import { errorMessage } from '../../utils/errors.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { clampTimeout, notifyPeerFeedback, truncateText } from '../peer/peerFeedback.js';
import { normalizeExecAgentMode, renderExecAgentTerminal } from '../processDelegateTerminal.js';
import { DESCRIPTION, EXEC_AGENT_TOOL_NAME, PROMPT } from './prompt.js';

const DEFAULT_EXEC_AGENT_MODE = (process.platform === 'win32' ? 'exec' : 'pty') as const;

/** Auto-detect best available provider when none specified. */
function pickDefaultProvider(): string {
  const ids = getExecAgentProviderIds();
  // Priority: codex > opencode > claude > code
  for (const preferred of ['codex', 'opencode', 'claude', 'code']) {
    if (ids.includes(preferred)) return preferred;
  }
  return ids[0] ?? 'codex';
}

const inputSchema = lazySchema(() =>
  z.object({
    provider: z
      .string()
      .optional()
      .describe(
        `Which AI coding CLI to use. Leave empty to auto-select. Available: ${getExecAgentProviderIds().join(', ')}`,
      ),
    prompt: z.string().describe('Task or message to send to the local AI CLI agent'),
    mode: z
      .enum(['exec', 'pty'])
      .optional()
      .default(DEFAULT_EXEC_AGENT_MODE)
      .describe(
        process.platform === 'win32'
          ? 'Execution mode. Windows uses "exec" with terminal-style output because node-pty is unstable there.'
          : 'Execution mode. "pty" is the default terminal-style live view; "exec" is stable one-shot capture.',
      ),
    cwd: z.string().optional().describe('Working directory for the exec agent task. Defaults to the current Clew cwd.'),
    model: z.string().optional().describe('Optional model override for providers that support it.'),
    timeout: z.number().optional().default(600).describe('Max execution time in seconds (default: 600, max: 1800).'),
    sessionId: z
      .string()
      .optional()
      .describe(
        'Session/conversation ID to resume (from a previous codex result). Pass it to continue a multi-turn conversation.',
      ),
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
    sessionId: z
      .string()
      .optional()
      .describe('Session ID from the codex thread. Use it in a follow-up call to continue the conversation.'),
  }),
);

export type Output = z.infer<ReturnType<typeof outputSchema>>;

export const ExecAgentTool = buildTool({
  isConcurrencySafe() {
    return false;
  },
  isReadOnly() {
    return false;
  },
  interruptBehavior() {
    return 'cancel';
  },
  isTransparentWrapper() {
    return true;
  },
  name: EXEC_AGENT_TOOL_NAME,
  searchHint: 'run task on local AI CLI agent (codex, opencode, claude)',
  maxResultSizeChars: 100_000,
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
  async validateInput(input: { provider?: string }) {
    const provider = input.provider?.toLowerCase();
    if (provider === 'clew' || provider === 'clewcode') {
      return {
        result: false,
        message:
          'Clew cannot be used as an exec agent provider because it self-spawns the current CLI. Use provider "codex".',
        errorCode: 400,
      };
    }
    return { result: true };
  },
  userFacingName() {
    return 'Exec agent';
  },
  renderToolUseMessage(
    input: Partial<{ provider?: string; prompt?: string; cwd?: string; mode?: string; sessionId?: string }>,
  ) {
    const mode = normalizeExecAgentMode(input.mode, DEFAULT_EXEC_AGENT_MODE);
    const label = input.sessionId ? `resume ${mode}` : mode;
    return React.createElement(
      Text,
      null,
      `${input.provider ?? 'codex'} ${label}${input.cwd ? ` in ${input.cwd}` : ''}: `,
      React.createElement(Text, { dimColor: true }, truncateText(input.prompt ?? '', 120)),
    );
  },
  renderToolUseProgressMessage(progressMessages): React.ReactNode {
    const latest = progressMessages.at(-1)?.data as ExecAgentProgress | undefined;
    return renderExecAgentTerminal({
      latest,
      defaultProvider: 'codex',
      defaultMode: DEFAULT_EXEC_AGENT_MODE,
      title: 'Exec agent',
    });
  },
  renderToolUseQueuedMessage(): React.ReactNode {
    return renderExecAgentTerminal({
      latest: undefined,
      defaultProvider: 'codex',
      defaultMode: DEFAULT_EXEC_AGENT_MODE,
      title: 'Exec agent',
    });
  },
  getActivityDescription(input: Partial<{ provider?: string; prompt?: string; mode?: string }>) {
    const mode = normalizeExecAgentMode(input.mode, DEFAULT_EXEC_AGENT_MODE);
    return `Running ${input.provider ?? 'exec agent'} (${mode}): ${truncateText(input.prompt ?? '', 80)}`;
  },
  getToolUseSummary(input: Partial<{ provider?: string; prompt?: string; mode?: string }>) {
    const mode = normalizeExecAgentMode(input.mode, DEFAULT_EXEC_AGENT_MODE);
    return `${input.provider ?? 'exec agent'} ${mode}: ${truncateText(input.prompt ?? '', 80)}`;
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const sessionLine = output.sessionId ? `sessionId: ${output.sessionId}` : '';

    if (!output.success) {
      const text = (output.stdout || '').trim() || output.stderr || output.error || '(empty)';
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: [
          `[Exec agent:${output.provider}] Failed: ${output.exitCode ?? output.signal ?? 'unknown'}`,
          sessionLine,
          '',
          text,
        ].join('\n'),
      };
    }

    const text = (output.stdout || '').trim() || output.stderr || '(empty)';
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [
        `[Exec agent:${output.provider}] exit ${output.exitCode ?? output.signal ?? 'unknown'} in ${(
          (output.durationMs ?? 0) / 1000
        ).toFixed(1)}s`,
        sessionLine,
        '',
        text,
      ].join('\n'),
    };
  },
  async call(
    input: {
      provider?: string;
      prompt: string;
      mode?: 'exec' | 'pty';
      cwd?: string;
      model?: string;
      timeout?: number;
      sessionId?: string;
    },
    _context,
    _canUseTool,
    _parentMessage,
    onProgress?: ToolCallProgress<ExecAgentProgress>,
  ) {
    const providerId = input.provider ?? pickDefaultProvider();
    const provider = getExecAgentProvider(providerId);
    if (!provider) {
      return {
        data: {
          success: false,
          provider: providerId,
          error: `Unknown exec agent provider "${providerId}". Available: ${getExecAgentProviderIds().join(', ')}`,
        },
      };
    }

    try {
      const timeout = clampTimeout(input.timeout, 600, 1800);
      let progressSeq = 0;
      notifyPeerFeedback(`asking ${provider.label}`, 'exec-agent', 'low');
      const result = await provider.runTask({
        prompt: input.prompt,
        mode: normalizeExecAgentMode(input.mode, DEFAULT_EXEC_AGENT_MODE),
        cwd: input.cwd ?? getCwd(),
        model: input.model,
        sessionId: input.sessionId,
        timeoutMs: timeout,
        abortSignal: _context.abortController.signal,
        onProgress: progress => {
          onProgress?.({
            toolUseID: `exec-agent-${++progressSeq}`,
            data: {
              type: 'execAgent',
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
        'exec-agent-result',
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
      notifyPeerFeedback(`failed: ${truncateText(error, 120)}`, 'exec-agent-error', 'high');
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
