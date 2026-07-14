/**
 * Core message types used across the CLI, bridge, and assistant subsystems.
 */

export interface Message {
  type: string;
  [key: string]: unknown;
}

export interface AssistantMessage extends Message {
  type: 'assistant';
  message: {
    content: unknown[];
    stop_reason?: string | null;
    usage?: unknown;
  };
  uuid: string;
  session_id: string;
  error?: string;
  parent_tool_use_id?: string | null;
  isApiErrorMessage?: boolean;
}

export interface UserMessage extends Message {
  type: 'user';
  uuid: string;
  session_id?: string;
  message: { role: string; content: unknown };
  text?: string;
  isMeta?: true;
  isVisibleInTranscriptOnly?: true;
  isVirtual?: true;
  isCompactSummary?: true;
  summarizeMetadata?: Record<string, unknown>;
  timestamp?: string;
  toolUseResult?: unknown;
  mcpMeta?: Record<string, unknown>;
  imagePasteIds?: number[];
  videoPasteIds?: number[];
  sourceToolAssistantUUID?: string;
  permissionMode?: string;
  origin?: string;
}

export interface AttachmentMessage extends Message {
  type: 'attachment';
  uuid: string;
  name: string;
  content: unknown;
  session_id?: string;
}

export interface SystemMessage extends Message {
  type: 'system';
  content: unknown;
  uuid: string;
  subtype?: string;
  compactMetadata?: CompactMetadata;
  error?: unknown;
  retryAttempt?: number;
  maxRetries?: number;
  retryInMs?: number;
}

export interface SystemAPIErrorMessage extends Message {
  type: 'system_api_error';
  error: string;
  uuid: string;
}

export interface SystemFileSnapshotMessage extends Message {
  type: 'system_file_snapshot';
  uuid: string;
  session_id?: string;
  files?: string[];
}

export interface SystemLocalCommandMessage extends Message {
  type: 'system_local_command';
  uuid: string;
  command: string;
  output: string;
  exit_code: number;
}

export interface ProgressMessage extends Message {
  type: 'progress';
  uuid: string;
  label: string;
  progress: number;
  total?: number;
}

export interface StreamEvent extends Message {
  type: 'stream_event';
  event: string;
  data: unknown;
  uuid: string;
}

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
}
