import { feature } from 'bun:bundle';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import * as React from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { useAppState, useSetAppState } from 'src/state/AppState.js';
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js';
import { getKairosActive, getMainThreadAgentType, getOriginalCwd, getSdkBetas, getSessionId } from '../bootstrap/state.js';
import { DEFAULT_OUTPUT_STYLE_NAME } from '../constants/outputStyles.js';
import { useNotifications } from '../context/notifications.js';
import { getTotalAPIDuration, getTotalDuration, getTotalInputTokens, getTotalLinesAdded, getTotalLinesRemoved, getTotalOutputTokens } from '../cost-tracker.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { type ReadonlySettings, useSettings } from '../hooks/useSettings.js';
import { Ansi, Box, Text } from '../ink.js';
import { ProviderManager } from '../services/ai/ProviderManager.js';
import { getRawUtilization } from '../services/claudeAiLimits.js';
import type { Message } from '../types/message.js';
import type { StatusLineCommandInput } from '../types/statusLine.js';
import type { VimMode } from '../types/textInputTypes.js';
import { checkHasTrustDialogAccepted } from '../utils/config.js';
import { calculateContextPercentages, getContextWindowForModel } from '../utils/context.js';
import { getCwd } from '../utils/cwd.js';
import { logForDebugging } from '../utils/debug.js';
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js';
import { createBaseHookInput, executeStatusLineCommand } from '../utils/hooks.js';
import { getLastAssistantMessage } from '../utils/messages.js';
import { getRuntimeMainLoopModel, type ModelName, renderModelName } from '../utils/model/model.js';
import { getCurrentSessionTitle } from '../utils/sessionStorage.js';
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../utils/tokens.js';
import { roughTokenCountEstimationForMessages } from '../services/tokenEstimation.js';
import { getCurrentWorktreeSession } from '../utils/worktree.js';
import { isVimModeEnabled } from './PromptInput/utils.js';

export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false;
  return true;
}

function buildStatusLineCommandInput(
  permissionMode: PermissionMode,
  exceeds200kTokens: boolean,
  settings: ReadonlySettings,
  messages: Message[],
  addedDirs: string[],
  mainLoopModel: ModelName,
  vimMode?: VimMode,
  providerOverride?: string
): StatusLineCommandInput {
  const agentType = getMainThreadAgentType();
  const worktreeSession = getCurrentWorktreeSession();
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens
  });
  const outputStyleName = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME;
  const currentUsage = getCurrentUsage(messages);
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
  const contextPercentages = calculateContextPercentages(currentUsage, contextWindowSize);
  const sessionId = getSessionId();
  const sessionName = getCurrentSessionTitle(sessionId);
  const rawUtil = getRawUtilization();
  const rateLimits: StatusLineCommandInput['rate_limits'] = {
    ...(rawUtil.five_hour && {
      five_hour: {
        used_percentage: rawUtil.five_hour.utilization * 100,
        resets_at: rawUtil.five_hour.resets_at
      }
    }),
    ...(rawUtil.seven_day && {
      seven_day: {
        used_percentage: rawUtil.seven_day.utilization * 100,
        resets_at: rawUtil.seven_day.resets_at
      }
    })
  };
  return {
    ...createBaseHookInput(),
    ...(sessionName && {
      session_name: sessionName
    }),
    model: {
      id: runtimeModel,
      display_name: renderModelName(runtimeModel, providerOverride).replace(/^[^:]+:\s*/, '')
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs,
      git_worktree: getCurrentWorktreeSession() !== null
    },
    version: MACRO.VERSION,
    output_style: {
      name: outputStyleName
    },
    cost: {
      total_cost_usd: getTotalCost(),
      total_duration_ms: getTotalDuration(),
      total_api_duration_ms: getTotalAPIDuration(),
      total_lines_added: getTotalLinesAdded(),
      total_lines_removed: getTotalLinesRemoved()
    },
    context_window: {
      total_input_tokens: getTotalInputTokens(),
      total_output_tokens: getTotalOutputTokens(),
      context_window_size: contextWindowSize,
      current_usage: currentUsage,
      used_percentage: contextPercentages.used,
      remaining_percentage: contextPercentages.remaining
    },
    exceeds_200k_tokens: exceeds200kTokens,
    ...((rateLimits.five_hour || rateLimits.seven_day) && {
      rate_limits: rateLimits
    }),
    ...(isVimModeEnabled() && {
      vim: {
        mode: vimMode ?? 'INSERT'
      }
    }),
    ...(agentType && {
      agent: {
        name: agentType
      }
    }),
    ...(worktreeSession && {
      worktree: {
        name: worktreeSession.worktreeName,
        path: worktreeSession.worktreePath,
        branch: worktreeSession.worktreeBranch,
        original_cwd: worktreeSession.originalCwd,
        original_branch: worktreeSession.originalBranch
      }
    })
  };
}

type Props = {
  messagesRef: React.RefObject<Message[]>;
  lastAssistantMessageId: string | null;
  vimMode?: VimMode;
};

export function getLastAssistantMessageId(messages: Message[]): string | null {
  return getLastAssistantMessage(messages)?.uuid ?? null;
}

// ─── Claude-HUD-inspired helpers ───────────────────────────────────────────

/** Visual context bar like claude-hud's coloredBar */
function coloredBar(percent: number, width: number = 10): string {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safePercent / 100) * width);
  const empty = width - filled;

  let colorFn: (text: string) => string;
  if (percent > 85) colorFn = chalk.hex('#ff4444');       // red
  else if (percent > 70) colorFn = chalk.hex('#ffaa00');  // yellow/warning
  else colorFn = chalk.white;                              // white

  const emptyFn = chalk.hex('#555555');
  return colorFn('█'.repeat(filled)) + emptyFn('░'.repeat(empty));
}

interface ToolActivity {
  id: string;
  name: string;
  target?: string;
  status: 'running' | 'completed' | 'error';
  isMcp?: boolean;
  startedAt?: number;
  endedAt?: number;
}

interface AgentActivity {
  id: string;
  type: string;
  description?: string;
  status: 'running' | 'completed';
  startedAt?: number;
  endedAt?: number;
}

interface TodoState {
  inProgress: string | null;
  completed: number;
  total: number;
}

function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return (input.file_path as string) ?? (input.path as string);
    case 'Glob':
      return input.pattern as string;
    case 'Grep':
      return input.pattern as string;
    case 'Bash': {
      const cmd = input.command as string;
      return cmd ? cmd.slice(0, 30) + (cmd.length > 30 ? '...' : '') : undefined;
    }
  }
  return undefined;
}

/** Block shape for tool_use/tool_result parsing — subset of actual message content blocks */
interface ActivityBlock {
  type: string;
  id?: string;
  name?: string;
  tool_use_id?: string;
  input?: Record<string, unknown>;
  is_error?: boolean;
  subagent_type?: string;
  description?: string;
  subject?: string;
  status?: string;
  taskId?: string | number;
  todos?: Array<{ content: string; status: string }>;
}

function messageContent(message: Message): unknown[] {
  const wrappedContent = (message as any).message?.content;
  if (Array.isArray(wrappedContent)) return wrappedContent;
  const directContent = (message as any).content;
  if (Array.isArray(directContent)) return directContent;
  return [];
}

function messageTimestamp(message: Message): number | undefined {
  const raw = (message as any).timestamp ?? (message as any).createdAt ?? (message as any).created_at;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const parsed = typeof raw === 'number' ? raw : Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCompactDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatActivityDuration(item: { startedAt?: number; endedAt?: number }): string {
  if (!item.startedAt || !item.endedAt || item.endedAt < item.startedAt) return '';
  return chalk.dim(` (${formatCompactDuration(item.endedAt - item.startedAt)})`);
}

function countHooks(settings: ReadonlySettings): number {
  const hooks = settings?.hooks;
  if (!hooks) return 0;
  return Object.values(hooks).reduce((total, matchers) => {
    if (!Array.isArray(matchers)) return total;
    return total + matchers.reduce((sum, matcher) => sum + (Array.isArray((matcher as any).hooks) ? (matcher as any).hooks.length : 0), 0);
  }, 0);
}

function countPermissionRules(settings: ReadonlySettings): number {
  const permissions = settings?.permissions;
  if (!permissions) return 0;
  return (
    (permissions.allow?.length ?? 0) +
    (permissions.deny?.length ?? 0) +
    (permissions.ask?.length ?? 0)
  );
}

function countClaudeFiles(cwd: string): number {
  const seen = new Set<string>();
  const addIfExists = (path: string) => {
    if (existsSync(path)) seen.add(path);
  };

  let dir = cwd;
  while (dir && dirname(dir) !== dir) {
    addIfExists(join(dir, 'CLAUDE.md'));
    addIfExists(join(dir, '.claude', 'CLAUDE.md'));
    dir = dirname(dir);
  }
  addIfExists(join(dir, 'CLAUDE.md'));
  addIfExists(join(homedir(), '.claude', 'CLAUDE.md'));
  return seen.size;
}

/** Extract tool activity and agent state from all messages.
 *  Mirrors claude-hud's transcript.ts processEntry logic. */
function extractActivity(messages: Message[]): {
  tools: ToolActivity[];
  agents: AgentActivity[];
  todos: TodoState | null;
} {
  const toolMap = new Map<string, ToolActivity>();
  const agentMap = new Map<string, AgentActivity>();
  const taskIdToIndex = new Map<string, number>();
  let latestTodos: Array<{ content: string; status: string }> = [];

  for (const msg of messages) {
    const content = messageContent(msg);
    const timestamp = messageTimestamp(msg);

    for (const block of content as ActivityBlock[]) {
      // Tool use => running tool
      if (block.type === 'tool_use' && block.id && block.name) {
        const isMcpTool = block.name.startsWith('mcp__');
        const toolEntry: ToolActivity = {
          id: block.id,
          name: block.name,
          target: extractTarget(block.name, block.input),
          status: 'running',
          isMcp: isMcpTool,
          startedAt: timestamp,
        };

        if (block.name === 'Task' || block.name === 'Agent') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          agentMap.set(block.id, {
            id: block.id,
            type: (input.subagent_type as string) ?? 'agent',
            description: (input.description as string) ?? undefined,
            status: 'running',
            startedAt: timestamp,
          });
        } else if (block.name === 'TodoWrite') {
          const input = (block.input ?? {}) as { todos?: Array<{ content: string; status: string }> };
          if (input.todos && Array.isArray(input.todos)) {
            // Preserve task IDs by content matching (same as claude-hud)
            const contentToTaskIds = new Map<string, string[]>();
            for (const [taskId, idx] of taskIdToIndex) {
              if (idx < latestTodos.length) {
                const existingContent = latestTodos[idx].content;
                const ids = contentToTaskIds.get(existingContent) ?? [];
                ids.push(taskId);
                contentToTaskIds.set(existingContent, ids);
              }
            }
            latestTodos = input.todos.map(t => ({ content: t.content, status: t.status }));
            taskIdToIndex.clear();
            for (let i = 0; i < latestTodos.length; i++) {
              const ids = contentToTaskIds.get(latestTodos[i].content);
              if (ids && ids.length > 0) {
                taskIdToIndex.set(ids.shift()!, i);
                if (ids.length === 0) contentToTaskIds.delete(latestTodos[i].content);
              }
            }
          }
        } else if (block.name === 'TaskCreate') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          const subject = typeof input.subject === 'string' ? input.subject : '';
          const desc = typeof input.description === 'string' ? input.description : '';
          const todoContent = subject || desc || 'Untitled task';
          const status = input.status === 'in_progress' ? 'in_progress' :
                         input.status === 'completed' ? 'completed' : 'pending';
          latestTodos.push({ content: todoContent, status });
          const taskId = input.taskId ?? block.id;
          if (taskId) taskIdToIndex.set(String(taskId), latestTodos.length - 1);
        } else if (block.name === 'TaskUpdate') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          const tid = input.taskId;
          let idx: number | null = null;
          if (typeof tid === 'string' || typeof tid === 'number') {
            const key = String(tid);
            idx = taskIdToIndex.get(key) ?? null;
            if (idx === null && /^\d+$/.test(key)) {
              const n = parseInt(key, 10) - 1;
              if (n >= 0 && n < latestTodos.length) idx = n;
            }
          }
          if (idx !== null && idx < latestTodos.length) {
            if (input.status) {
              const s = String(input.status);
              latestTodos[idx].status = s === 'completed' ? 'completed' :
                                        s === 'in_progress' ? 'in_progress' : 'pending';
            }
            const newSubject = typeof input.subject === 'string' ? input.subject : '';
            const newDesc = typeof input.description === 'string' ? input.description : '';
            if (newSubject || newDesc) latestTodos[idx].content = newSubject || newDesc;
          }
        } else {
          toolMap.set(block.id, toolEntry);
        }
      }

      // Tool result => completed/error
      if (block.type === 'tool_result' && block.tool_use_id) {
        const tool = toolMap.get(block.tool_use_id);
        if (tool) {
          tool.status = block.is_error ? 'error' : 'completed';
          tool.endedAt = timestamp;
        }
        const agent = agentMap.get(block.tool_use_id);
        if (agent) {
          agent.status = 'completed';
          agent.endedAt = timestamp;
        }
      }
    }
  }

  const tools = Array.from(toolMap.values());
  const agents = Array.from(agentMap.values());

  // Build todo state
  let todos: TodoState | null = null;
  if (latestTodos.length > 0) {
    const inProgress = latestTodos.find(t => t.status === 'in_progress');
    const completed = latestTodos.filter(t => t.status === 'completed').length;
    todos = {
      inProgress: inProgress ? inProgress.content : null,
      completed,
      total: latestTodos.length,
    };
  }

  return { tools, agents, todos };
}

function truncate(str: string, maxLen: number = 40): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ─── StatusLine component ──────────────────────────────────────────────────

function StatusLineInner({
  messagesRef,
  lastAssistantMessageId,
  vimMode
}: Props): React.ReactNode {
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const permissionMode = useAppState(s => s.toolPermissionContext.mode);
  const additionalWorkingDirectories = useAppState(s => s.toolPermissionContext.additionalWorkingDirectories);
  const statusLineText = useAppState(s => s.statusLineText);
  const setAppState = useSetAppState();
  const settings = useSettings();
  const { addNotification } = useNotifications();
  const mainLoopModel = useMainLoopModel();
  const mcpCount = useAppState(s => s.mcp.clients.length) as number;
  const mainLoopProvider = useAppState(s => s.mainLoopProvider);
  const mainLoopProviderForSession = useAppState(s => s.mainLoopProviderForSession);
  const [currentCwd, setCurrentCwd] = React.useState(getCwd());
  const fullscreenEnabled = isFullscreenEnvEnabled();

  // Poll for CWD changes to update status line when /setpath is used
  React.useEffect(() => {
    const checkCwd = () => {
      const newCwd = getCwd();
      setCurrentCwd(prev => prev !== newCwd ? newCwd : prev);
    };
    const timer = setInterval(checkCwd, 500);
    return () => clearInterval(timer);
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const vimModeRef = useRef(vimMode);
  vimModeRef.current = vimMode;
  const permissionModeRef = useRef(permissionMode);
  permissionModeRef.current = permissionMode;
  const addedDirsRef = useRef(additionalWorkingDirectories);
  addedDirsRef.current = additionalWorkingDirectories;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;

  const previousStateRef = useRef<{
    messageId: string | null;
    exceeds200kTokens: boolean;
    permissionMode: PermissionMode;
    vimMode: VimMode | undefined;
    mainLoopModel: ModelName;
    provider?: string;
  }>({
    messageId: null,
    exceeds200kTokens: false,
    permissionMode,
    vimMode,
    mainLoopModel,
    provider: mainLoopProviderForSession ?? mainLoopProvider
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const logNextResultRef = useRef(true);

  const doUpdate = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const msgs = messagesRef.current;
    const logResult = logNextResultRef.current;
    logNextResultRef.current = false;
    try {
      let exceeds200kTokens = previousStateRef.current.exceeds200kTokens;
      const currentMessageId = getLastAssistantMessageId(msgs);
      if (currentMessageId !== previousStateRef.current.messageId) {
        exceeds200kTokens = doesMostRecentAssistantMessageExceed200k(msgs);
        previousStateRef.current.messageId = currentMessageId;
        previousStateRef.current.exceeds200kTokens = exceeds200kTokens;
      }
      const activeProvider = mainLoopProviderForSession ?? mainLoopProvider;
      const statusInput = buildStatusLineCommandInput(permissionModeRef.current, exceeds200kTokens, settingsRef.current, msgs, Array.from(addedDirsRef.current.keys()), mainLoopModelRef.current, vimModeRef.current, activeProvider);
      const text = await executeStatusLineCommand(statusInput, controller.signal, undefined, logResult);
      if (!controller.signal.aborted) {
        setAppState(prev => {
          if (prev.statusLineText === text) return prev;
          return { ...prev, statusLineText: text };
        });
      }
    } catch { /* ignore */ }
  }, [messagesRef, setAppState]);

  const scheduleUpdate = useCallback(() => {
    if (debounceTimerRef.current !== undefined) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = undefined;
      void doUpdate();
    }, 300);
  }, [doUpdate]);

  useEffect(() => {
    const activeProvider = mainLoopProviderForSession ?? mainLoopProvider;
    if (lastAssistantMessageId !== previousStateRef.current.messageId || permissionMode !== previousStateRef.current.permissionMode || vimMode !== previousStateRef.current.vimMode || mainLoopModel !== previousStateRef.current.mainLoopModel || activeProvider !== previousStateRef.current.provider) {
      previousStateRef.current.permissionMode = permissionMode;
      previousStateRef.current.vimMode = vimMode;
      previousStateRef.current.mainLoopModel = mainLoopModel;
      previousStateRef.current.provider = activeProvider;
      scheduleUpdate();
    }
  }, [lastAssistantMessageId, permissionMode, vimMode, mainLoopModel, mainLoopProvider, mainLoopProviderForSession, scheduleUpdate]);

  useEffect(() => {
    const statusLine = settings?.statusLine;
    if (statusLine) {
      logEvent('tengu_status_line_mount', {
        command_length: statusLine.command.length,
        padding: statusLine.padding
      });
      if (settings.disableAllHooks === true) {
        logForDebugging('Status line is configured but disableAllHooks is true', { level: 'warn' });
      }
      if (!checkHasTrustDialogAccepted()) {
        addNotification({
          key: 'statusline-trust-blocked',
          text: 'statusline skipped · restart to fix',
          color: 'warning',
          priority: 'low'
        });
      }
    }
  }, []);

  useEffect(() => {
    void doUpdate();
    return () => {
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current !== undefined) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const paddingX = settings?.statusLine?.padding ?? 0;
  const filteredStatusLineText = statusLineText && /mode on \([^)]*cycle\)/i.test(statusLineText) ? undefined : statusLineText;

  const defaultStatusLine = !filteredStatusLineText ? (() => {
    const runtimeModel = getRuntimeMainLoopModel({
      permissionMode,
      mainLoopModel,
      exceeds200kTokens: previousStateRef.current.exceeds200kTokens
    });
    const currentUsage = getCurrentUsage(messagesRef.current);
    let inputTokens = currentUsage?.input_tokens ?? 0;
    let outputTokens = currentUsage?.output_tokens ?? 0;

    if (!currentUsage && messagesRef.current.length > 0) {
      const estimatedTokens = roughTokenCountEstimationForMessages(messagesRef.current);
      inputTokens = Math.round(estimatedTokens * 0.7);
      outputTokens = Math.round(estimatedTokens * 0.3);
    }

    const usageForContext = currentUsage ?? {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas());
    const contextPercentages = calculateContextPercentages(usageForContext, contextWindowSize);
    const cwd = currentCwd;
    const duration = getTotalDuration();
    const usedPercentage = contextPercentages.used ?? 0;
    const rawModelName = renderModelName(runtimeModel, mainLoopProviderForSession ?? mainLoopProvider);
    // Strip provider prefix (e.g., "KiloCode: ") when showing in status line,
    // since the provider is already displayed separately in brackets below
    const modelName = rawModelName.replace(/^[^:]+:\s*/, '');

    // Context bar (claude-hud style)
    const bar = coloredBar(usedPercentage, 10);

    // Extract tool/agent/todo activity
    const { tools, agents, todos } = extractActivity(messagesRef.current);
    const runningTools = tools.filter(t => t.status === 'running');
    const completedTools = tools.filter(t => t.status === 'completed' || t.status === 'error');
    const runningAgents = agents.filter(a => a.status === 'running');
    const completedAgents = agents.filter(a => a.status === 'completed');

    // Build tool count summary for completed tools
    const toolCounts = new Map<string, number>();
    for (const t of completedTools) {
      toolCounts.set(t.name, (toolCounts.get(t.name) ?? 0) + 1);
    }
    const sortedCompletedTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const claudeCount = countClaudeFiles(cwd);
    const ruleCount = countPermissionRules(settings);
    const hookCount = countHooks(settings);
    const percentText = usedPercentage > 85
      ? chalk.hex('#ff4444')(`${usedPercentage.toFixed(0)}%`)
      : usedPercentage > 70
        ? chalk.hex('#ffaa00')(`${usedPercentage.toFixed(0)}%`)
        : chalk.green(`${usedPercentage.toFixed(0)}%`);

const activeProvider = mainLoopProviderForSession ?? mainLoopProvider ?? ProviderManager.getInstance().getActiveProviderName()
    const activeProviderDisplay = activeProvider ? chalk.hex('#888888')(`[${activeProvider}]`) : ''
    const cwdShort = cwd.length > 40 ? '...' + cwd.slice(-37) : cwd
    const cwdDisplay = chalk.hex('#666666')(cwdShort)
    const line1 =
      chalk.cyan(`[${modelName}]`) +
      activeProviderDisplay +
      chalk.dim(' ') +
      cwdDisplay +
      chalk.dim(' | ') +
      bar +
      ' ' +
      percentText +
      chalk.dim(` | ${claudeCount} CLAUDE.md | ${ruleCount} rules | ${mcpCount} MCPs | ${hookCount} hooks | `) +
      chalk.white('◷') +
      chalk.dim(` ${formatCompactDuration(duration)}`);

    // ── Build activity line string ──
    let activityLine = '';
    if (runningTools.length > 0 || sortedCompletedTools.length > 0) {
      const parts: string[] = [];
      for (const t of runningTools.slice(-3)) {
        if (t.isMcp) {
          parts.push(
            chalk.hex('#AA88FF')('◈') + ' ' + chalk.hex('#CC99FF')(t.name.replace(/^mcp__/, 'mcp:')) +
            (t.target ? chalk.dim(`: ${truncate(t.target.replace(/\\/g, '/'), 25)}`) : '')
          );
        } else {
          parts.push(
            chalk.yellow('◐') + ' ' + chalk.cyan(t.name) +
            (t.target ? chalk.dim(`: ${truncate(t.target.replace(/\\/g, '/'), 25)}`) : '')
          );
        }
      }
      for (const [name, count] of sortedCompletedTools) {
        parts.push(chalk.green('✓') + ' ' + name + ' ' + chalk.dim(`×${count}`));
      }
      activityLine = parts.join(' | ');
    }

    const agentLines = [
      ...runningAgents.slice(-2).map(a =>
        chalk.yellow('◐') + ' ' + chalk.magenta(a.type) +
        (a.description ? chalk.dim(`: ${truncate(a.description, 54)}`) : '')
      ),
      ...completedAgents.slice(-3).map(a =>
        chalk.green('✓') + ' ' + chalk.magenta(a.type) +
        (a.description ? chalk.dim(`: ${truncate(a.description, 54)}`) : '') +
        formatActivityDuration(a)
      ),
    ];

    const todoLine = todos
      ? todos.total > 0 && todos.completed === todos.total
        ? chalk.green('✓') + ' All todos complete ' + chalk.dim(`(${todos.completed}/${todos.total})`)
        : todos.inProgress
          ? chalk.green('✓') + ' ' + truncate(todos.inProgress, 60) + ' ' + chalk.dim(`(${todos.completed}/${todos.total})`)
          : chalk.green('✓') + ' Todos ' + chalk.dim(`(${todos.completed}/${todos.total})`)
      : '';

    return (
      <Box flexDirection="column" gap={0} marginTop={0}>
        <Box>
          <Text>
            <Ansi>{line1}</Ansi>
          </Text>
        </Box>

        {activityLine && (
          <Box>
            <Text>
              <Ansi>{activityLine}</Ansi>
            </Text>
          </Box>
        )}

        {agentLines.map((line, index) => (
          <Box key={`agent-line-${index}`}>
            <Text>
              <Ansi>{line}</Ansi>
            </Text>
          </Box>
        ))}

        {todoLine && (
          <Box>
            <Text>
              <Ansi>{todoLine}</Ansi>
            </Text>
          </Box>
        )}
      </Box>
    );
  })() : null;

  return (
    <Box paddingX={paddingX} flexDirection="column" gap={0} marginTop={0}>
      {filteredStatusLineText && (
        <Box paddingLeft={1} marginBottom={0} justifyContent="flex-start">
          <Ansi>{chalk.gray.dim(filteredStatusLineText)}</Ansi>
        </Box>
      )}
      {defaultStatusLine || (fullscreenEnabled ? <Text> </Text> : null)}
    </Box>
  );
}

export const StatusLine = memo(StatusLineInner);
