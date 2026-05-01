import { feature } from 'bun:bundle';
import chalk from 'chalk';
import * as React from 'react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { useAppState, useSetAppState } from 'src/state/AppState.js';
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js';
import { getKairosActive, getMainThreadAgentType, getOriginalCwd, getSdkBetas, getSessionId } from '../bootstrap/state.js';
import { DEFAULT_OUTPUT_STYLE_NAME } from '../constants/outputStyles.js';
import { useNotifications } from '../context/notifications.js';
import { getTotalAPIDuration, getTotalCost, getTotalDuration, getTotalInputTokens, getTotalLinesAdded, getTotalLinesRemoved, getTotalOutputTokens } from '../cost-tracker.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { type ReadonlySettings, useSettings } from '../hooks/useSettings.js';
import { Ansi, Box, Text } from '../ink.js';
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
import { fileHistoryGetSessionFileDiffStats } from '../utils/fileHistory.js';
import { isVimModeEnabled } from './PromptInput/utils.js';
import { getBranch } from '../utils/git.js';

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
      display_name: renderModelName(runtimeModel, providerOverride)
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs
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
  const [currentBranch, setCurrentBranch] = React.useState<string | null>(null);
  const fileHistory = useAppState(s => s.fileHistory);
  const [modifiedFiles, setModifiedFiles] = React.useState<Array<{
    path: string;
    added: number;
    removed: number;
  }>>([]);
  const mcpCount = useAppState(s => s.mcp.clients.length) as number;
  const thinkingEnabled = useAppState(s => s.thinkingEnabled);
  const mainLoopProvider = useAppState(s => s.mainLoopProvider);
  const mainLoopProviderForSession = useAppState(s => s.mainLoopProviderForSession);
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
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
      const [branch, sessionFileDiffs] = await Promise.all([getBranch(), fileHistoryGetSessionFileDiffStats(fileHistory)]);
      setCurrentBranch(branch);
      const nextModifiedFiles = sessionFileDiffs.map(fileStats => ({
        path: fileStats.path,
        added: fileStats.insertions,
        removed: fileStats.deletions
      }));
      setModifiedFiles(nextModifiedFiles.slice(0, 5));
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
  }, [fileHistory, messagesRef, setAppState]);

  const scheduleUpdate = useCallback(() => {
    if (debounceTimerRef.current !== undefined) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = undefined;
      void doUpdate();
    }, 300);
  }, [doUpdate]);

  useEffect(() => {
    const activeProvider = mainLoopProviderForSession ?? mainLoopProvider;
    if (lastAssistantMessageId !== previousStateRef.current.messageId || permissionMode !== previousStateRef.current.permissionMode || vimMode !== previousStateRef.current.vimMode || mainLoopModel !== previousStateRef.current.mainLoopModel || activeProvider !== (previousStateRef.current as any).provider) {
      previousStateRef.current.permissionMode = permissionMode;
      previousStateRef.current.vimMode = vimMode;
      previousStateRef.current.mainLoopModel = mainLoopModel;
      (previousStateRef.current as any).provider = activeProvider;
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
    const cacheReadTokens = usageForContext.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usageForContext.cache_creation_input_tokens ?? 0;
    const cwd = getCwd();
    const projectName = cwd.split(/[/\\]/).pop() || cwd;
    const gitBranch = currentBranch;
    const cost = getTotalCost();
    const duration = getTotalDuration();

    const formatDuration = (ms: number): string => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    };

    const formatCost = (usd: number): string => usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
    const usedPercentage = contextPercentages.used ?? 0;
    const approxContextTokens = inputTokens + cacheReadTokens + cacheWriteTokens;
    const timeStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
    const statusText = thinkingEnabled ? 'THINKING' : 'IDLE';

    return (
      <Box flexDirection="column" gap={0} marginTop={0}>
        <Box flexDirection="row" gap={0}>
          <Box paddingX={1} backgroundColor={thinkingEnabled ? 'green' : '#333333'}>
            <Text color={thinkingEnabled ? 'black' : 'white'} bold>{statusText}</Text>
          </Box>
          <Box paddingX={1} backgroundColor="#222222">
            <Text color="white">{projectName} {gitBranch ? chalk.blue(`(${gitBranch})`) : ''}</Text>
          </Box>
          <Box paddingX={1} backgroundColor="#333333">
            <Text color="cyan">{renderModelName(runtimeModel, mainLoopProviderForSession ?? mainLoopProvider)}</Text>
          </Box>
          <Box paddingX={1} backgroundColor="#444444">
            <Text color="yellow">{(approxContextTokens / 1000).toFixed(1)}k ({usedPercentage.toFixed(0)}%)</Text>
          </Box>
          <Box paddingX={1} backgroundColor="#222222">
            <Text color="green">{formatCost(cost)}</Text>
          </Box>
          {mcpCount > 0 && (
            <Box paddingX={1} backgroundColor="#5533FF">
              <Text color="white">MCP:{mcpCount}</Text>
            </Box>
          )}
          <Box paddingX={1} backgroundColor="#111111" flexGrow={1} justifyContent="flex-end">
            <Text color="gray">{timeStr}</Text>
          </Box>
        </Box>

        <Box paddingX={1} marginTop={0}>
          <Text dimColor>
            <Ansi>{chalk.gray(`In: ${(inputTokens / 1000).toFixed(1)}k Out: ${(outputTokens / 1000).toFixed(1)}k Cache: ${((cacheReadTokens + cacheWriteTokens) / 1000).toFixed(1)}k | Session: ${formatDuration(duration)}`)}</Ansi>
          </Text>
        </Box>

        {modifiedFiles.length > 0 && (
          <Box flexDirection="column" gap={0} marginTop={0} paddingLeft={1}>
            <Box borderStyle="round" borderColor="gray" borderTop={false} borderBottom={false} borderLeft={true} borderRight={false} paddingLeft={1}>
              <Box flexDirection="column">
                {modifiedFiles.map(file => (
                  <Text key={file.path} wrap="truncate">
                    <Ansi>{chalk.white(file.path.split(/[/\\]/).pop())} </Ansi>
                    <Ansi>{chalk.green(`+${file.added} `)}</Ansi>
                    <Ansi>{chalk.red(`-${file.removed}`)}</Ansi>
                  </Text>
                ))}
              </Box>
            </Box>
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
      {defaultStatusLine || (isFullscreenEnvEnabled() ? <Text> </Text> : null)}
    </Box>
  );
}

export const StatusLine = memo(StatusLineInner);
