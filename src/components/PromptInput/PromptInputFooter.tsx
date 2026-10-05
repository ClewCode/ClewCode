import { feature } from 'bun:bundle';
import type * as React from 'react';
import { memo, type ReactNode, useEffect, useMemo, useState } from 'react';
import { isBridgeEnabled } from '../../bridge/bridgeEnabled.js';
import { getBridgeStatus } from '../../bridge/bridgeStatusUtil.js';
import { useSetPromptOverlay } from '../../context/promptOverlayContext.js';
import type { VerificationStatus } from '../../hooks/useApiKeyVerification.js';
import type { IDESelection } from '../../hooks/useIdeSelection.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '../../ink.js';
import type { MCPServerConnection } from '../../services/mcp/types.js';
import { useAppState } from '../../state/AppState.js';
import type { ToolPermissionContext } from '../../Tool.js';
import type { Message } from '../../types/message.js';
import type { PromptInputMode, VimMode } from '../../types/textInputTypes.js';
import type { AutoUpdaterResult } from '../../utils/autoUpdater.js';
import { formatDuration } from '../../utils/format.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { getFullGoalState } from '../../utils/sessionGoalState.js';
import { isUndercover } from '../../utils/undercover.js';
import { CoordinatorTaskPanel, useCoordinatorTaskCount } from '../CoordinatorAgentStatus.js';
import { DynamicWorkflowStatusLine } from '../DynamicWorkflowProgress.js';
import { NotificationRightSlot } from '../notifications/NotificationRightSlot.js';
import { CopiedToast, Notifications } from './Notifications.js';
import { PromptInputFooterLeftSide } from './PromptInputFooterLeftSide.js';
import { PromptInputFooterSuggestions, type SuggestionItem } from './PromptInputFooterSuggestions.js';
import { PromptInputHelpMenu } from './PromptInputHelpMenu.js';

type Props = {
  apiKeyStatus: VerificationStatus;
  debug: boolean;
  exitMessage: {
    show: boolean;
    key?: string;
  };
  vimMode: VimMode | undefined;
  mode: PromptInputMode;
  autoUpdaterResult: AutoUpdaterResult | null;
  isAutoUpdating: boolean;
  verbose: boolean;
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  suggestions: SuggestionItem[];
  selectedSuggestion: number;
  maxColumnWidth?: number;
  toolPermissionContext: ToolPermissionContext;
  helpOpen: boolean;
  suppressHint: boolean;
  isLoading: boolean;
  tasksSelected: boolean;
  teamsSelected: boolean;
  bridgeSelected: boolean;
  tmuxSelected: boolean;
  teammateFooterIndex?: number;
  ideSelection: IDESelection | undefined;
  mcpClients?: MCPServerConnection[];
  isPasting?: boolean;
  isInputWrapped?: boolean;
  messages: Message[];
  isSearching: boolean;
  historyQuery: string;
  setHistoryQuery: (query: string) => void;
  historyFailedMatch: boolean;
  onOpenTasksDialog?: (taskId?: string) => void;
};
function PromptInputFooter({
  apiKeyStatus,
  exitMessage,
  vimMode,
  mode,
  autoUpdaterResult,
  isAutoUpdating,
  verbose,
  onAutoUpdaterResult,
  onChangeIsUpdating,
  suggestions,
  selectedSuggestion,
  maxColumnWidth,
  toolPermissionContext,
  helpOpen,
  suppressHint: suppressHintFromProps,
  isLoading,
  tasksSelected,
  teamsSelected,
  bridgeSelected,
  tmuxSelected,
  teammateFooterIndex,
  ideSelection,
  mcpClients,
  isPasting = false,
  isInputWrapped = false,
  messages,
  isSearching,
  historyQuery,
  setHistoryQuery,
  historyFailedMatch,
  onOpenTasksDialog,
}: Props): ReactNode {
  const { columns } = useTerminalSize();
  const isNarrow = columns < 80;
  const isFullscreen = isFullscreenEnvEnabled();

  // Pill highlights when tasks is the active footer item AND no specific
  // agent row is selected. When coordinatorTaskIndex >= 0 the pointer has
  // moved into CoordinatorTaskPanel, so the pill should un-highlight.
  // coordinatorTaskCount === 0 covers the bash-only case (no agent rows
  // exist, pill is the only selectable item).
  const coordinatorTaskCount = useCoordinatorTaskCount();
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex);
  const sessionGoal = useAppState(s => s.sessionGoal);
  const sessionGoalStartTime = useAppState(s => s.sessionGoalStartTime);
  const sessionGoalPaused = useAppState(s => s.sessionGoalPaused);
  const sessionGoalTotalPausedMs = useAppState(s => s.sessionGoalTotalPausedMs);
  const [goalNow, setGoalNow] = useState(Date.now());
  const pillSelected = tasksSelected && (coordinatorTaskCount === 0 || coordinatorTaskIndex < 0);

  useEffect(() => {
    if (!sessionGoal) return;
    const timer = setInterval(() => setGoalNow(Date.now()), 1000);
    timer.unref();
    return () => clearInterval(timer);
  }, [sessionGoal]);

  const suppressHint = suppressHintFromProps || isSearching;
  const goalState = getFullGoalState();
  const goalBlocked = goalState?.blocked ?? false;
  const goalStopped = /(?:turn|time) limit reached/i.test(goalState?.blockedReason ?? goalState?.lastReason ?? '');
  const goalStatus = goalBlocked ? (goalStopped ? 'stopped' : 'blocked') : sessionGoalPaused ? 'paused' : 'active';
  const goalActiveText = sessionGoal
    ? `/goal ${goalStatus} (${formatDuration(
        goalNow - (sessionGoalStartTime ?? goalNow) - (sessionGoalTotalPausedMs ?? 0),
        {
          hideTrailingZeros: true,
          mostSignificantOnly: true,
        },
      )})`
    : undefined;
  const footerLeftSide = (
    <PromptInputFooterLeftSide
      exitMessage={exitMessage}
      vimMode={vimMode}
      mode={mode}
      toolPermissionContext={toolPermissionContext}
      suppressHint={suppressHint}
      isLoading={isLoading}
      tasksSelected={pillSelected}
      teamsSelected={teamsSelected}
      teammateFooterIndex={teammateFooterIndex}
      tmuxSelected={tmuxSelected}
      isPasting={isPasting}
      isSearching={isSearching}
      historyQuery={historyQuery}
      setHistoryQuery={setHistoryQuery}
      historyFailedMatch={historyFailedMatch}
      onOpenTasksDialog={onOpenTasksDialog}
    />
  );
  // Fullscreen: portal data to FullscreenLayout — see promptOverlayContext.tsx
  const overlayData = useMemo(
    () =>
      isFullscreen && suggestions.length
        ? {
            suggestions,
            selectedSuggestion,
            maxColumnWidth,
          }
        : null,
    [isFullscreen, suggestions, selectedSuggestion, maxColumnWidth],
  );
  useSetPromptOverlay(overlayData);
  if (suggestions.length && !isFullscreen) {
    return (
      <Box paddingX={2} paddingY={0}>
        <PromptInputFooterSuggestions
          suggestions={suggestions}
          selectedSuggestion={selectedSuggestion}
          maxColumnWidth={maxColumnWidth}
        />
      </Box>
    );
  }
  if (helpOpen) {
    return <PromptInputHelpMenu dimColor={true} fixedWidth={true} paddingX={2} />;
  }
  return (
    <>
      <Box
        flexDirection={isNarrow ? 'column' : 'row'}
        justifyContent={isNarrow ? 'flex-start' : 'space-between'}
        paddingLeft={0}
        paddingRight={2}
        gap={isNarrow ? 0 : 1}
      >
        <Box flexDirection="column" flexGrow={isNarrow ? 0 : 1} flexShrink={isNarrow ? 0 : 1}>
          {!isFullscreen && (
            <Notifications
              apiKeyStatus={apiKeyStatus}
              autoUpdaterResult={autoUpdaterResult}
              isAutoUpdating={isAutoUpdating}
              verbose={verbose}
              messages={messages}
              onAutoUpdaterResult={onAutoUpdaterResult}
              onChangeIsUpdating={onChangeIsUpdating}
              ideSelection={ideSelection}
              mcpClients={mcpClients}
              isInputWrapped={isInputWrapped}
              // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
              isNarrow={isNarrow}
            />
          )}
          <Box flexDirection="row" justifyContent="space-between" width="100%">
            <Box overflowX="hidden" flexShrink={1}>
              {footerLeftSide}
            </Box>
            <Box flexDirection="row" flexShrink={0} gap={1}>
              {goalActiveText ? (
                <Text color="ide" wrap="truncate">
                  {goalActiveText}
                </Text>
              ) : null}
            </Box>
          </Box>
        </Box>
        <Box flexShrink={1} gap={1} justifyContent="flex-end">
          {/* Right-aligned notifications (the effort indicator) — see
              notificationPlacement.ts. Rendered here rather than in the left
              column so it sits with the other persistent status indicators.
              Same fullscreen rule as CopiedToast below: in fullscreen the top
              notification band owns this slot, so rendering it here too would
              show the indicator twice. */}
          {!isFullscreen && <NotificationRightSlot />}
          {/* In fullscreen the copy toast renders in the top notification band
              (top-right of the prompt); render here only for the inline footer. */}
          {!isFullscreen && <CopiedToast />}
          {/* @ts-expect-error TS2367 intentional DCE - 'external' vs 'ant' for bun:bundle */}
          {'external' === 'ant' && isUndercover() && <Text dimColor>undercover</Text>}
          <BridgeStatusIndicator bridgeSelected={bridgeSelected} />
        </Box>
      </Box>
      {/* @ts-expect-error TS2367 intentional DCE - 'external' vs 'ant' for bun:bundle */}
      {'external' === 'ant' && <CoordinatorTaskPanel />}
      <DynamicWorkflowStatusLine />
    </>
  );
}
export default memo(PromptInputFooter);
type BridgeStatusProps = {
  bridgeSelected: boolean;
};
function BridgeStatusIndicator({ bridgeSelected }: BridgeStatusProps): React.ReactNode {
  if (!feature('BRIDGE_MODE')) return null;

  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  const enabled = useAppState(s => s.replBridgeEnabled);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  const connected = useAppState(s_0 => s_0.replBridgeConnected);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  const sessionActive = useAppState(s_1 => s_1.replBridgeSessionActive);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  const reconnecting = useAppState(s_2 => s_2.replBridgeReconnecting);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  const explicit = useAppState(s_3 => s_3.replBridgeExplicit);

  // Failed state is surfaced via notification (useReplBridge), not a footer pill.
  if (!isBridgeEnabled() || !enabled) return null;
  const status = getBridgeStatus({
    error: undefined,
    connected,
    sessionActive,
    reconnecting,
  });

  // For implicit (config-driven) remote, only show the reconnecting state
  if (!explicit && status.label !== 'Remote Control reconnecting') {
    return null;
  }
  return (
    <Text color={bridgeSelected ? 'background' : status.color} inverse={bridgeSelected} wrap="truncate">
      {status.label}
      {bridgeSelected && <Text dimColor> · Enter to view</Text>}
    </Text>
  );
}
