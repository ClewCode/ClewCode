import { feature } from 'bun:bundle';
import { dirname } from 'path';
import React, { useState } from 'react';
import { useTerminalSize } from 'src/hooks/useTerminalSize.js';
import type { AgentColorName } from 'src/tools/AgentTool/agentColorManager.js';
import type { AgentDefinition } from 'src/tools/AgentTool/loadAgentsDir.js';
import { getOriginalCwd, switchSession } from '../bootstrap/state.js';
import type { Command } from '../commands.js';
import { LogSelector } from '../components/LogSelector.js';
import { type ResumeSizeChoice, ResumeSizeWarning } from '../components/ResumeSizeWarning.js';
import { Spinner } from '../components/Spinner.js';
import { restoreCostStateForSession } from '../cost-tracker.js';
import { setClipboard } from '../ink/termio/osc.js';
import { Box, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js';
import type { MCPServerConnection, ScopedMcpServerConfig } from '../services/mcp/types.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import type { Tool } from '../Tool.js';
import { asSessionId } from '../types/ids.js';
import type { LogOption } from '../types/logs.js';
import type { Message } from '../types/message.js';
import { agenticSessionSearch } from '../utils/agenticSessionSearch.js';
import { renameRecordingForSession } from '../utils/asciicast.js';
import { updateSessionName } from '../utils/concurrentSessions.js';
import { loadConversationForResume } from '../utils/conversationRecovery.js';
import { checkCrossProjectResume } from '../utils/crossProjectResume.js';
import { errorMessage } from '../utils/errors.js';
import type { FileHistorySnapshot } from '../utils/fileHistory.js';
import { logError } from '../utils/log.js';
import { createSystemMessage, createUserMessage } from '../utils/messages.js';
import {
  getResumeSizeInfo,
  type ResumeSizeInfo,
  shouldWarnBeforeResume,
  suppressResumeSizeWarning,
} from '../utils/resumeSizeWarning.js';
import {
  computeStandaloneAgentContext,
  restoreAgentFromSession,
  restoreWorktreeForResume,
} from '../utils/sessionRestore.js';
import {
  adoptResumedSessionFile,
  enrichLogs,
  isCustomTitleEnabled,
  loadAllProjectsMessageLogsProgressive,
  loadSameRepoMessageLogsProgressive,
  recordContentReplacement,
  resetSessionFilePointer,
  restoreSessionMetadata,
  type SessionLogResult,
  setSessionModelForTranscript,
} from '../utils/sessionStorage.js';
import type { ThinkingConfig } from '../utils/thinking.js';
import type { ContentReplacementRecord } from '../utils/toolResultStorage.js';
import { REPL } from './REPL.js';

function parsePrIdentifier(value: string): number | null {
  const directNumber = parseInt(value, 10);
  if (!Number.isNaN(directNumber) && directNumber > 0) {
    return directNumber;
  }
  const urlMatch = value.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
  if (urlMatch?.[1]) {
    return parseInt(urlMatch[1], 10);
  }
  return null;
}

type Props = {
  commands: Command[];
  worktreePaths: string[];
  initialTools: Tool[];
  mcpClients?: MCPServerConnection[];
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>;
  debug: boolean;
  mainThreadAgentDefinition?: AgentDefinition;
  autoConnectIdeFlag?: boolean;
  strictMcpConfig?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  initialSearchQuery?: string;
  disableSlashCommands?: boolean;
  forkSession?: boolean;
  taskListId?: string;
  filterByPr?: boolean | number | string;
  thinkingConfig: ThinkingConfig;
  onTurnComplete?: (messages: Message[]) => void | Promise<void>;
};

export function ResumeConversation({
  commands,
  worktreePaths,
  initialTools,
  mcpClients,
  dynamicMcpConfig,
  debug,
  mainThreadAgentDefinition,
  autoConnectIdeFlag,
  strictMcpConfig = false,
  systemPrompt,
  appendSystemPrompt,
  initialSearchQuery,
  disableSlashCommands = false,
  forkSession,
  taskListId,
  filterByPr,
  thinkingConfig,
  onTurnComplete,
}: Props): React.ReactNode {
  const { rows } = useTerminalSize();
  const agentDefinitions = useAppState(s => s.agentDefinitions);
  const setAppState = useSetAppState();
  const [logs, setLogs] = React.useState<LogOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resuming, setResuming] = React.useState(false);
  const [showAllProjects, setShowAllProjects] = React.useState(false);
  const [resumeData, setResumeData] = React.useState<{
    messages: Message[];
    fileHistorySnapshots?: FileHistorySnapshot[];
    contentReplacements?: ContentReplacementRecord[];
    agentName?: string;
    agentColor?: AgentColorName;
    mainThreadAgentDefinition?: AgentDefinition;
  } | null>(null);
  const [crossProjectCommand, setCrossProjectCommand] = React.useState<string | null>(null);
  // Large/old session picked but not yet confirmed — awaiting the summary/full choice.
  const [pendingResume, setPendingResume] = React.useState<{
    data: NonNullable<typeof resumeData>;
    info: ResumeSizeInfo;
  } | null>(null);
  const sessionLogResultRef = React.useRef<SessionLogResult | null>(null);
  // Mirror of logs.length so loadMoreLogs can compute value indices outside
  // the setLogs updater (keeping it pure per React's contract).
  const logCountRef = React.useRef(0);

  const filteredLogs = React.useMemo(() => {
    let result = logs.filter(l => !l.isSidechain);
    if (filterByPr !== undefined) {
      if (filterByPr === true) {
        result = result.filter(l => l.prNumber !== undefined);
      } else if (typeof filterByPr === 'number') {
        result = result.filter(l => l.prNumber === filterByPr);
      } else if (typeof filterByPr === 'string') {
        const prNumber = parsePrIdentifier(filterByPr);
        if (prNumber !== null) {
          result = result.filter(l => l.prNumber === prNumber);
        }
      }
    }
    return result;
  }, [logs, filterByPr]);
  const isResumeWithRenameEnabled = isCustomTitleEnabled();
  const [abortController] = useState(() => new AbortController()); // BUG #4, #5

  React.useEffect(() => {
    // BUG #5: Add cancellation logic for initial logs load
    const controller = new AbortController();
    let isMounted = true;

    loadSameRepoMessageLogsProgressive(worktreePaths)
      .then(result => {
        if (!isMounted || controller.signal.aborted) return;
        sessionLogResultRef.current = result;
        logCountRef.current = result.logs.length;
        setLogs(result.logs);
        setLoading(false);
      })
      .catch(error => {
        if (isMounted && !controller.signal.aborted) {
          logError(error);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort(); // Cancel pending operations on unmount
    };
  }, [worktreePaths]);

  const loadMoreLogs = React.useCallback(
    (count: number) => {
      const ref = sessionLogResultRef.current;
      if (!ref || ref.nextIndex >= ref.allStatLogs.length) return;

      void enrichLogs(ref.allStatLogs, ref.nextIndex, count).then(result => {
        // BUG #4: Check abort signal before updating state
        if (abortController.signal.aborted) return;

        ref.nextIndex = result.nextIndex;
        if (result.logs.length > 0) {
          // enrichLogs returns fresh unshared objects — safe to mutate in place.
          // Offset comes from logCountRef so the setLogs updater stays pure.
          const offset = logCountRef.current;
          result.logs.forEach((log, i) => {
            log.value = offset + i;
          });
          setLogs(prev => prev.concat(result.logs));
          logCountRef.current += result.logs.length;
        } else if (ref.nextIndex < ref.allStatLogs.length) {
          // BUG #4: Prevent unbounded recursion with depth limit
          const depth = (result as any).depth ?? 0;
          if (depth < 10) {
            loadMoreLogs(count);
          }
        }
      });
    },
    [abortController],
  );

  const loadLogs = React.useCallback(
    (allProjects: boolean) => {
      setLoading(true);
      const promise = allProjects
        ? loadAllProjectsMessageLogsProgressive()
        : loadSameRepoMessageLogsProgressive(worktreePaths);
      promise
        .then(result => {
          sessionLogResultRef.current = result;
          logCountRef.current = result.logs.length;
          setLogs(result.logs);
        })
        .catch(error => {
          logError(error);
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [worktreePaths],
  );

  const handleToggleAllProjects = React.useCallback(() => {
    const newValue = !showAllProjects;
    setShowAllProjects(newValue);
    loadLogs(newValue);
  }, [showAllProjects, loadLogs]);

  function onCancel() {
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1);
  }

  const [resumeError, setResumeError] = useState<string | null>(null);

  async function onSelect(log: LogOption) {
    setResuming(true);
    setResumeError(null); // Clear any previous error (BUG #1, #2)
    const resumeStart = performance.now();

    const crossProjectCheck = checkCrossProjectResume(log, showAllProjects, worktreePaths);
    if (crossProjectCheck.isCrossProject) {
      if (!crossProjectCheck.isSameRepoWorktree) {
        const raw = await setClipboard(crossProjectCheck.command);
        if (raw) process.stdout.write(raw);
        setCrossProjectCommand(crossProjectCheck.command);
        setResuming(false);
        return;
      }
    }

    try {
      const result = await loadConversationForResume(log, undefined);
      if (!result) {
        throw new Error('Failed to load conversation');
      }

      if (feature('COORDINATOR_MODE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const coordinatorModule =
          require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        const warning = coordinatorModule.matchSessionMode(result.mode);
        if (warning) {
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } =
            require('../tools/AgentTool/loadAgentsDir.js') as typeof import('../tools/AgentTool/loadAgentsDir.js');
          /* eslint-enable @typescript-eslint/no-require-imports */
          getAgentDefinitionsWithOverrides.cache.clear?.();
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(getOriginalCwd());
          setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
            },
          }));
          result.messages.push(createSystemMessage(warning, 'warning'));
        }
      }

      if (result.sessionId && !forkSession) {
        switchSession(asSessionId(result.sessionId), log.fullPath ? dirname(log.fullPath) : null);
        await renameRecordingForSession();
        await resetSessionFilePointer();
        restoreCostStateForSession(result.sessionId);
      } else if (forkSession && result.contentReplacements?.length) {
        await recordContentReplacement(result.contentReplacements);
      }

      const { agentDefinition: resolvedAgentDef } = restoreAgentFromSession(
        result.agentSetting,
        mainThreadAgentDefinition,
        agentDefinitions,
      );
      setAppState(prev => ({ ...prev, agent: resolvedAgentDef?.agentType }));

      // Restore the session model so resumed sessions keep the model
      // they were using (e.g. set via /model during the original session).
      if (log.sessionModel) {
        setSessionModelForTranscript(log.sessionModel);
        setAppState(prev => ({
          ...prev,
          mainLoopModelForSession: log.sessionModel,
        }));
      }

      if (feature('COORDINATOR_MODE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { saveMode } = require('../utils/sessionStorage.js');
        const { isCoordinatorMode } =
          require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        saveMode(isCoordinatorMode() ? 'coordinator' : 'normal');
      }

      const standaloneAgentContext = computeStandaloneAgentContext(result.agentName, result.agentColor);
      if (standaloneAgentContext) {
        setAppState(prev => ({ ...prev, standaloneAgentContext }));
      }
      void updateSessionName(result.agentName);

      restoreSessionMetadata(forkSession ? { ...result, worktreeSession: undefined } : result);

      if (!forkSession) {
        restoreWorktreeForResume(result.worktreeSession);
        if (result.sessionId) {
          adoptResumedSessionFile();
        }
      }

      if (feature('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        (
          require('../services/contextCollapse/persist.js') as typeof import('../services/contextCollapse/persist.js')
        ).restoreFromEntries(result.contextCollapseCommits ?? [], result.contextCollapseSnapshot);
        /* eslint-enable @typescript-eslint/no-require-imports */
      }

      logEvent('tengu_session_resumed', {
        entrypoint: 'picker' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
        resume_duration_ms: Math.round(performance.now() - resumeStart),
      });

      setLogs([]);
      const data = {
        messages: result.messages,
        fileHistorySnapshots: result.fileHistorySnapshots,
        contentReplacements: result.contentReplacements,
        agentName: result.agentName,
        agentColor: (result.agentColor === 'default' ? undefined : result.agentColor) as AgentColorName | undefined,
        mainThreadAgentDefinition: resolvedAgentDef,
      };

      // Offer summarization before replaying an expensive session. The
      // transcript is already loaded from disk here — nothing has been sent to
      // the API yet, so declining costs the user nothing.
      const info = getResumeSizeInfo(result.messages, log.modified, Date.now());
      if (shouldWarnBeforeResume(info)) {
        setPendingResume({ data, info });
        return;
      }
      setResumeData(data);
    } catch (e) {
      logEvent('tengu_session_resumed', {
        entrypoint: 'picker' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: false,
      });
      const errorMsg = errorMessage(e as Error);
      logError(new Error(`Resume failed: ${errorMsg}`));
      setResumeError(`Failed to resume: ${errorMsg}`); // BUG #1, #2: Show error instead of throwing
    } finally {
      setResuming(false); // BUG #2: Always reset spinner, even on error
    }
  }

  function onResumeSizeChoice(choice: ResumeSizeChoice) {
    if (!pendingResume) return;
    if (choice === 'never-ask') {
      suppressResumeSizeWarning();
    }
    if (choice === 'summary') {
      // REPL auto-submits initialMessage on mount, and string content routes
      // through the normal prompt path — so /compact runs as a real command
      // against the restored transcript.
      setAppState(prev => ({
        ...prev,
        initialMessage: { message: createUserMessage({ content: '/compact' }) },
      }));
    }
    logEvent('tengu_resume_size_warning_choice', {
      choice: choice as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    setResumeData(pendingResume.data);
    setPendingResume(null);
  }

  if (crossProjectCommand) {
    return <CrossProjectMessage command={crossProjectCommand} />;
  }

  if (pendingResume) {
    return <ResumeSizeWarning info={pendingResume.info} onChange={onResumeSizeChoice} onCancel={onCancel} />;
  }

  if (resumeData) {
    return (
      <REPL
        debug={debug}
        commands={commands}
        initialTools={initialTools}
        initialMessages={resumeData.messages}
        initialFileHistorySnapshots={resumeData.fileHistorySnapshots}
        initialContentReplacements={resumeData.contentReplacements}
        initialAgentName={resumeData.agentName}
        initialAgentColor={resumeData.agentColor}
        mcpClients={mcpClients}
        dynamicMcpConfig={dynamicMcpConfig}
        strictMcpConfig={strictMcpConfig}
        systemPrompt={systemPrompt}
        appendSystemPrompt={appendSystemPrompt}
        mainThreadAgentDefinition={resumeData.mainThreadAgentDefinition}
        autoConnectIdeFlag={autoConnectIdeFlag}
        disableSlashCommands={disableSlashCommands}
        taskListId={taskListId}
        thinkingConfig={thinkingConfig}
        onTurnComplete={onTurnComplete}
      />
    );
  }

  if (loading) {
    return (
      <Box>
        <Spinner />
        <Text> Loading conversations…</Text>
      </Box>
    );
  }

  if (resuming) {
    return (
      <Box>
        <Spinner />
        <Text> Resuming conversation…</Text>
      </Box>
    );
  }

  if (resumeError) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="red">✗ {resumeError}</Text>
        <Text dimColor>Press Ctrl+C to exit or select another conversation</Text>
      </Box>
    );
  }

  if (filteredLogs.length === 0) {
    return <NoConversationsMessage />;
  }

  return (
    <LogSelector
      logs={filteredLogs}
      maxHeight={rows}
      onCancel={onCancel}
      onSelect={onSelect}
      onLogsChanged={isResumeWithRenameEnabled ? () => loadLogs(showAllProjects) : undefined}
      onLoadMore={loadMoreLogs}
      initialSearchQuery={initialSearchQuery}
      showAllProjects={showAllProjects}
      onToggleAllProjects={handleToggleAllProjects}
      onAgenticSearch={agenticSessionSearch}
    />
  );
}

function NoConversationsMessage(): React.ReactNode {
  useKeybinding(
    'app:interrupt',
    () => {
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(1);
    },
    { context: 'Global' },
  );

  return (
    <Box flexDirection="column">
      <Text>No conversations found to resume.</Text>
      <Text dimColor>Press Ctrl+C to exit and start a new conversation.</Text>
    </Box>
  );
}

function CrossProjectMessage({ command }: { command: string }): React.ReactNode {
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      // eslint-disable-next-line custom-rules/no-process-exit
      process.exit(0);
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Box flexDirection="column" gap={1}>
      <Text>This conversation is from a different directory.</Text>
      <Box flexDirection="column">
        <Text>To resume, run:</Text>
        <Text> {command}</Text>
      </Box>
      <Text dimColor>(Command copied to clipboard)</Text>
    </Box>
  );
}
