/**
 * Core message types used across the CLI, bridge, and assistant subsystems.
 *
 * `Message` is a discriminated union on `type`. Shapes below are derived from
 * the construction sites in src/utils/messages.ts and friends (see
 * baseCreateAssistantMessage, createUserMessage, createSystemMessage, ...).
 */

import type {
  ContentBlock,
  ContentBlockParam,
  RedactedThinkingBlock,
  RedactedThinkingBlockParam,
  ThinkingBlock,
  ThinkingBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs';

export type MessageVideoBlock = {
  type: 'video';
  source: { type: 'base64' | 'url'; media_type: string; data?: string; url?: string };
};

export type MessageContentBlock = ContentBlockParam | ThinkingBlockParam | RedactedThinkingBlockParam;
export type MessageContentBlockWithThinking = ContentBlock | ThinkingBlock | RedactedThinkingBlock;

// ============================================================================
// Message origin
// ============================================================================

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string };

export type PartialCompactDirection = 'from' | 'up_to';

export type SystemMessageLevel = 'info' | 'warning' | 'error';

export interface StopHookInfo {
  command: string;
  promptText?: string;
  durationMs?: number;
}

// ============================================================================
// Core message variants
// ============================================================================

export interface AssistantMessage {
  type: 'assistant';
  message: {
    id?: string;
    container?: unknown;
    model?: string;
    role: 'assistant';
    stop_reason?: string | null;
    stop_sequence?: string | null;
    type?: 'message';
    usage?: unknown;
    content: MessageContentBlock[];
    context_management?: unknown;
  };
  timestamp?: string;
  uuid: string;
  session_id: string;
  parent_tool_use_id?: string | null;
  requestId?: string;
  apiError?: string;
  error?: string;
  errorDetails?: unknown;
  isApiErrorMessage?: boolean;
  isMeta?: boolean;
  isVirtual?: true;
}

export interface UserMessage {
  type: 'user';
  uuid: string;
  session_id?: string;
  message: { role: 'user'; content: string | MessageContentBlock[]; planContent?: string };
  text?: string;
  isMeta?: true;
  isVisibleInTranscriptOnly?: true;
  isVirtual?: true;
  isCompactSummary?: true;
  summarizeMetadata?: {
    messagesSummarized: number;
    userContext?: string;
    direction?: PartialCompactDirection;
  };
  toolUseResult?: unknown;
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> };
  imagePasteIds?: number[];
  videoPasteIds?: number[];
  sourceToolAssistantUUID?: string;
  permissionMode?: string;
  origin?: MessageOrigin;
  timestamp?: string;
  isReplay?: boolean;
}

export interface AttachmentMessage {
  type: 'attachment';
  uuid: string;
  attachment: {
    name?: string;
    content?: unknown;
    session_id?: string;
    mimeType?: string;
    source?: { type?: string; media_type?: string; data?: string };
    tool_use_id?: string;
    input?: Record<string, unknown>;
    output?: string;
    is_error?: boolean;
    path?: string;
    description?: string;
    [key: string]: unknown;
  };
  session_id?: string;
  timestamp: string;
  isMeta?: boolean;
}

export interface SystemMessageBase {
  content?: unknown;
  uuid: string;
  subtype?: string;
  level?: SystemMessageLevel;
  isMeta?: boolean;
  timestamp?: string;
  toolUseID?: string;
  compactMetadata?: CompactMetadata;
  error?: unknown;
  retryAttempt?: number;
  maxRetries?: number;
  retryInMs?: number;
}

export interface SystemMessage extends SystemMessageBase {
  type: 'system';
}

export interface SystemInformationalMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'informational';
  content: string;
  level: SystemMessageLevel;
  preventContinuation?: boolean;
}

export interface SystemPermissionRetryMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'permission_retry';
  content: string;
  commands: string[];
  level: 'info';
}

export interface SystemBridgeStatusMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'bridge_status';
  content: string;
  url: string;
  upgradeNudge?: string;
}

export interface SystemScheduledTaskFireMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'scheduled_task_fire';
  content: string;
}

export interface SystemStopHookSummaryMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'stop_hook_summary';
  hookCount: number;
  hookInfos: StopHookInfo[];
  hookErrors: string[];
  preventedContinuation: boolean;
  stopReason: string | undefined;
  hasOutput: boolean;
  level: SystemMessageLevel;
  toolUseID?: string;
  hookLabel?: string;
  totalDurationMs?: number;
}

export interface SystemTurnDurationMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'turn_duration';
  durationMs: number;
  budgetTokens?: number;
  budgetLimit?: number;
  budgetNudges?: number;
  messageCount?: number;
}

export interface SystemMemorySavedMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'memory_saved';
  writtenPaths: string[];
  verb?: string;
}

export interface SystemAgentsKilledMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'agents_killed';
}

export interface SystemAwaySummaryMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'away_summary';
  content: string;
  isMeta: false;
}

export interface SystemApiMetricsMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'api_metrics';
  ttftMs: number;
  otps: number;
  isP50?: boolean;
  hookDurationMs?: number;
  turnDurationMs?: number;
  toolDurationMs?: number;
  classifierDurationMs?: number;
  toolCount?: number;
  hookCount?: number;
  classifierCount?: number;
  configWriteCount?: number;
}

export interface SystemCompactBoundaryMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'compact_boundary';
  content: string;
  level: 'info';
  compactMetadata: CompactMetadata & {
    trigger: 'manual' | 'auto';
    preTokens: number;
    userContext?: string;
    messagesSummarized?: number;
  };
  logicalParentUuid?: string;
}

export interface SystemMicrocompactBoundaryMessage extends SystemMessageBase {
  type: 'system';
  subtype: 'microcompact_boundary';
  content: string;
  level: 'info';
  microcompactMetadata: {
    trigger: 'auto';
    preTokens: number;
    tokensSaved: number;
    compactedToolIds: string[];
    clearedAttachmentUUIDs: string[];
  };
}

export interface SystemAPIErrorMessage extends SystemMessageBase {
  type: 'system_api_error';
  error: string;
}

export interface SystemFileSnapshotMessage extends SystemMessageBase {
  type: 'system_file_snapshot';
  files?: string[];
}

export interface SystemLocalCommandMessage extends SystemMessageBase {
  type: 'system_local_command';
  command: string;
  output: string;
  exit_code: number;
}

export interface ProgressMessage<T = unknown> extends SystemMessageBase {
  type: 'progress';
  label?: string;
  progress?: number;
  total?: number;
  data: T;
  parentToolUseID?: string;
  toolUseID?: string;
}

export interface StreamEvent extends SystemMessageBase {
  type: 'stream_event';
  event: string;
  data: unknown;
}

export interface ToolUseSummaryMessage {
  type: 'tool_use_summary';
  summary: string;
  precedingToolUseIds: string[];
  uuid: string;
  timestamp: string;
}

export interface TombstoneMessage {
  type: 'tombstone';
  message: Message;
  uuid?: string;
  session_id?: string;
  timestamp?: string;
}

export interface RequestStartEvent {
  type: 'stream_request_start';
  uuid?: string;
}

export interface GroupedToolUseMessage {
  type: 'grouped_tool_use';
  toolName: string;
  messages: NormalizedAssistantMessage<ToolUseBlock>[];
  results: NormalizedUserMessage[];
  displayMessage: NormalizedAssistantMessage;
  uuid: string;
  timestamp: string;
  messageId: string;
}

export interface CollapsedReadSearchGroup {
  type: 'collapsed_read_search';
  searchCount: number;
  readCount: number;
  listCount: number;
  replCount: number;
  memorySearchCount: number;
  memoryReadCount: number;
  memoryWriteCount: number;
  readFilePaths: string[];
  searchArgs: string[];
  latestDisplayHint?: string;
  messages: CollapsibleMessage[];
  displayMessage: CollapsibleMessage;
  uuid: string;
  timestamp: string;
  teamMemorySearchCount?: number;
  teamMemoryReadCount?: number;
  teamMemoryWriteCount?: number;
  mcpCallCount?: number;
  mcpServerNames?: string[];
  bashCount?: number;
  gitOpBashCount?: number;
  commits?: { sha: string; kind: string }[];
  pushes?: { branch: string }[];
  branches?: { ref: string; action: string }[];
  prs?: { number: number; url?: string; action: string }[];
  hookTotalMs?: number;
  hookCount?: number;
  hookInfos?: StopHookInfo[];
  relevantMemories?: { path: string; content: string; mtimeMs: number }[];
}

// ============================================================================
// Normalized messages (post-normalizeMessages)
// ============================================================================

export type NormalizedAssistantMessage<T = MessageContentBlockWithThinking> = {
  type: 'assistant';
  timestamp?: string;
  message: AssistantMessage['message'] & {
    content: [T];
    context_management: unknown | null;
  };
  isMeta?: boolean;
  isVirtual?: true;
  requestId?: string;
  uuid: string;
  error?: string;
  isApiErrorMessage?: boolean;
  advisorModel?: string;
};

export interface NormalizedUserMessage {
  type: 'user';
  uuid: string;
  message: { role: 'user'; content: string | MessageContentBlock[] };
  isMeta?: true;
  isVisibleInTranscriptOnly?: true;
  isVirtual?: true;
  isCompactSummary?: true;
  summarizeMetadata?: {
    messagesSummarized: number;
    userContext?: string;
    direction?: PartialCompactDirection;
  };
  toolUseResult?: unknown;
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> };
  imagePasteIds?: number[];
  videoPasteIds?: number[];
  origin?: MessageOrigin;
  timestamp?: string;
  permissionMode?: string;
  sourceToolAssistantUUID?: string;
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | SystemMessage
  | ProgressMessage
  | StreamEvent;

// ============================================================================
// Renderable / derived groups
// ============================================================================

export type CollapsibleMessage = NormalizedAssistantMessage | NormalizedUserMessage | GroupedToolUseMessage;

export type RenderableMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | AttachmentMessage
  | SystemMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
  | ProgressMessage;

export type MessageWithoutProgress = Exclude<NormalizedMessage, ProgressMessage>;

export type HookResultMessage = Message | UserMessage | AttachmentMessage | ProgressMessage;

// ============================================================================
// Bridge / control protocol messages
// ============================================================================

export interface ControlRequestMessage {
  type: 'control_request';
  request_id: string;
  request: { subtype: string; [key: string]: unknown };
  uuid?: string;
}

export interface ControlResponseMessage {
  type: 'control_response';
  response: { subtype: 'success' | 'error'; request_id: string; response?: unknown; error?: string };
  session_id?: string;
  uuid?: string;
}

export interface UpdateEnvironmentVariablesMessage {
  type: 'update_environment_variables';
  variables: Record<string, string>;
  uuid?: string;
}

export interface ShutdownResponseMessage {
  type: 'shutdown_response';
  request_id: string;
  approve: boolean;
  reason?: string;
  uuid?: string;
}

export interface KeepAliveMessage {
  type: 'keep_alive';
  uuid?: string;
}

export interface ControlCancelRequestMessage {
  type: 'control_cancel_request';
  request_id: string;
  uuid?: string;
}

export interface PlanApprovalResponseMessage {
  type: 'plan_approval_response';
  requestId: string;
  approved: boolean;
  timestamp: string;
  feedback?: string;
  permissionMode?: string;
  uuid?: string;
}

// ============================================================================
// Shell progress
// ============================================================================

export interface BashProgress {
  type: 'bash_progress';
  output: string;
  fullOutput: string;
  elapsedTimeSeconds: number;
  totalLines: number;
  totalBytes?: number;
  timeoutMs?: number;
  taskId?: string;
}

export interface PowerShellProgress {
  type: 'powershell_progress';
  output: string;
  fullOutput: string;
  elapsedTimeSeconds: number;
  totalLines: number;
  totalBytes?: number;
  timeoutMs?: number;
  taskId?: string;
}

export type ShellProgress = BashProgress | PowerShellProgress;

// ============================================================================
// Message union
// ============================================================================

export type Message =
  | AssistantMessage
  | UserMessage
  | AttachmentMessage
  | SystemMessage
  | SystemAPIErrorMessage
  | SystemFileSnapshotMessage
  | SystemLocalCommandMessage
  | ProgressMessage
  | StreamEvent
  | ToolUseSummaryMessage
  | TombstoneMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
  | RequestStartEvent
  | ControlRequestMessage
  | ControlResponseMessage
  | UpdateEnvironmentVariablesMessage
  | ShutdownResponseMessage
  | KeepAliveMessage
  | ControlCancelRequestMessage
  | PlanApprovalResponseMessage;

export interface CompactMetadata {
  sourceLength: number;
  targetLength: number;
  originalTokens?: number;
  compactedTokens?: number;
  trigger?: string;
  preTokens?: number;
  preservedSegment?: {
    tailUuid?: string;
    headUuid?: string;
    anchorUuid?: string;
  };
  preCompactDiscoveredTools?: unknown;
}
