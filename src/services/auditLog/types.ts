/**
 * Audit Log Types — enterprise-grade structured logging for SIEM export.
 *
 * Every tool call, file access, command execution, and model request is
 * recorded as a structured NDJSON event. Format is compatible with:
 * - Splunk HEC (JSON event format)
 * - Datadog JSON log intake
 * - Elastic ECS (partial mapping)
 * - OpenTelemetry log export
 */

/** Sensitivity level for data classification */
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted';

/** Audit event severity */
export type AuditEventLevel = 'info' | 'warn' | 'error' | 'audit';

/** Categories of audit events */
export type AuditEventCategory =
  | 'tool.call'
  | 'tool.result'
  | 'tool.failure'
  | 'file.read'
  | 'file.write'
  | 'file.delete'
  | 'command.exec'
  | 'command.result'
  | 'model.request'
  | 'model.response'
  | 'model.error'
  | 'session.start'
  | 'session.end'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failure'
  | 'policy.block'
  | 'policy.violation'
  | 'classification.access'
  | 'config.change';

/** Base fields every audit event shares */
export interface AuditEventBase {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Event category */
  event: AuditEventCategory;
  /** Severity level */
  level: AuditEventLevel;
  /** Session identifier */
  sessionId: string;
  /** Authenticated user (email or system) */
  user: string;
  /** Project working directory */
  projectDir: string;
}

/** Tool call event */
export interface ToolCallEvent extends AuditEventBase {
  event: 'tool.call' | 'tool.result' | 'tool.failure';
  tool: {
    name: string;
    input?: Record<string, unknown>;
    /** Duration in ms */
    durationMs: number;
    /** Permission decision */
    allowed: boolean;
    reason?: string;
  };
  classification: DataClassification;
}

/** File access event */
export interface FileAccessEvent extends AuditEventBase {
  event: 'file.read' | 'file.write' | 'file.delete';
  file: {
    path: string;
    size?: number;
    /** File classification if tagged */
    classification?: DataClassification;
  };
  allowed: boolean;
}

/** Command execution event */
export interface CommandExecEvent extends AuditEventBase {
  event: 'command.exec' | 'command.result';
  command: {
    /** Truncated command (no args/values) for safe logging */
    safeSummary: string;
    /** Full command — may be omitted in low-sensitivity logs */
    full?: string;
    exitCode?: number;
    durationMs: number;
  };
  allowed: boolean;
}

/** Model request event */
export interface ModelRequestEvent extends AuditEventBase {
  event: 'model.request' | 'model.response' | 'model.error';
  model: {
    provider: string;
    modelId: string;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    durationMs: number;
  };
}

/** Policy event */
export interface PolicyEvent extends AuditEventBase {
  event: 'policy.block' | 'policy.violation' | 'classification.access';
  policy: {
    rule: string;
    detail: string;
    resource: string;
  };
}

/** Auth event */
export interface AuthEvent extends AuditEventBase {
  event: 'auth.login' | 'auth.logout' | 'auth.failure';
  auth: {
    method: string;
    provider?: string;
    error?: string;
  };
}

/** Session event */
export interface SessionEvent extends AuditEventBase {
  event: 'session.start' | 'session.end';
  session: {
    model?: string;
    provider?: string;
    durationMs?: number;
    messageCount?: number;
  };
}

/** Config change event */
export interface ConfigChangeEvent extends AuditEventBase {
  event: 'config.change';
  config: {
    key: string;
    previousValue?: unknown;
    newValue?: unknown;
  };
}

/** Union of all event types */
export type AuditEvent =
  | ToolCallEvent
  | FileAccessEvent
  | CommandExecEvent
  | ModelRequestEvent
  | PolicyEvent
  | AuthEvent
  | SessionEvent
  | ConfigChangeEvent;

/** Audit log configuration */
export interface AuditLogConfig {
  /** Enable/disable audit logging entirely */
  enabled: boolean;
  /** Directory for audit log files (default: .clew/audit/) */
  path?: string;
  /** Maximum log file size before rotation (in bytes, default: 100MB) */
  maxFileSizeBytes?: number;
  /** Maximum number of rotated log files to keep (default: 10) */
  maxFiles?: number;
  /** Event categories to include (empty = all) */
  includedEvents?: AuditEventCategory[];
  /** Event categories to exclude */
  excludedEvents?: AuditEventCategory[];
  /** Minimum level to log (default: 'info') */
  minLevel?: AuditEventLevel;
  /** Enable console output in addition to file (default: false) */
  consoleOutput?: boolean;
}
