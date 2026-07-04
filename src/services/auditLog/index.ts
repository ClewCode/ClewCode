import { registerCleanup } from '../../utils/cleanupRegistry.js';
import type {
  AuditEvent,
  AuditEventBase,
  AuditEventCategory,
  AuditEventLevel,
  AuditLogConfig,
  DataClassification,
} from './types.js';
import { AuditLogWriter } from './writer.js';

type AuditEventInput = Omit<AuditEventBase, 'timestamp' | 'sessionId' | 'user' | 'projectDir'> &
  Record<string, unknown>;

let writer: AuditLogWriter | null = null;
let writerProjectDir: string | null = null;
let initialized = false;
let unregisterCleanup: (() => void) | undefined;

const LEVELS: AuditEventLevel[] = ['info', 'warn', 'error', 'audit'];

export function isAuditLogEnabled(): boolean {
  return process.env.CLEW_AUDIT_LOG === '1' || process.env.CLEW_CODE_AUDIT_LOG === '1';
}

function parseList<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean) as T[];
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getAuditLogConfigFromEnv(): Partial<AuditLogConfig> {
  return {
    enabled: isAuditLogEnabled(),
    path: process.env.CLEW_AUDIT_LOG_PATH || process.env.CLEW_CODE_AUDIT_LOG_PATH,
    maxFileSizeBytes: parsePositiveInt(process.env.CLEW_AUDIT_LOG_MAX_BYTES),
    maxFiles: parsePositiveInt(process.env.CLEW_AUDIT_LOG_MAX_FILES),
    includedEvents: parseList<AuditEventCategory>(process.env.CLEW_AUDIT_LOG_INCLUDE),
    excludedEvents: parseList<AuditEventCategory>(process.env.CLEW_AUDIT_LOG_EXCLUDE),
    minLevel: LEVELS.includes(process.env.CLEW_AUDIT_LOG_MIN_LEVEL as AuditEventLevel)
      ? (process.env.CLEW_AUDIT_LOG_MIN_LEVEL as AuditEventLevel)
      : undefined,
    consoleOutput: process.env.CLEW_AUDIT_LOG_CONSOLE === '1',
  };
}

function getAuditUser(): string {
  return (
    process.env.CLEW_AUDIT_USER || process.env.GITHUB_ACTOR || process.env.USERNAME || process.env.USER || 'system'
  );
}

function getAuditSessionId(): string {
  return process.env.CLEW_CODE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
}

export function getAuditLogWriter(projectDir: string = process.cwd()): AuditLogWriter | null {
  if (!isAuditLogEnabled()) return null;

  if (!writer || writerProjectDir !== projectDir) {
    void writer?.close();
    writer = new AuditLogWriter({
      projectDir,
      config: getAuditLogConfigFromEnv(),
    });
    writerProjectDir = projectDir;
    initialized = false;
    unregisterCleanup?.();
    unregisterCleanup = registerCleanup(async () => {
      await writer?.close();
      writer = null;
      writerProjectDir = null;
      initialized = false;
    });
  }

  if (!initialized) {
    initialized = true;
    void writer.init();
  }

  return writer;
}

export function writeAuditEvent(event: AuditEventInput, projectDir: string = process.cwd()): void {
  const auditWriter = getAuditLogWriter(projectDir);
  if (!auditWriter) return;

  auditWriter.write({
    timestamp: new Date().toISOString(),
    sessionId: getAuditSessionId(),
    user: getAuditUser(),
    projectDir,
    ...event,
  } as AuditEvent);
}

export function auditToolCall(params: {
  toolName: string;
  input?: Record<string, unknown>;
  durationMs?: number;
  allowed: boolean;
  reason?: string;
  event?: 'tool.call' | 'tool.result' | 'tool.failure';
  level?: AuditEventLevel;
  classification?: DataClassification;
  projectDir?: string;
}): void {
  writeAuditEvent(
    {
      event: params.event ?? 'tool.call',
      level: params.level ?? 'audit',
      tool: {
        name: params.toolName,
        input: params.input,
        durationMs: params.durationMs ?? 0,
        allowed: params.allowed,
        reason: params.reason,
      },
      classification: params.classification ?? 'internal',
    },
    params.projectDir,
  );
}

export function auditFileAccess(params: {
  event: 'file.read' | 'file.write' | 'file.delete';
  path: string;
  size?: number;
  allowed: boolean;
  classification?: DataClassification;
  projectDir?: string;
}): void {
  writeAuditEvent(
    {
      event: params.event,
      level: 'audit',
      file: {
        path: params.path,
        size: params.size,
        classification: params.classification ?? 'internal',
      },
      allowed: params.allowed,
    },
    params.projectDir,
  );
}

export function auditCommandExec(params: {
  event: 'command.exec' | 'command.result';
  safeSummary: string;
  full?: string;
  exitCode?: number;
  durationMs?: number;
  allowed: boolean;
  projectDir?: string;
}): void {
  writeAuditEvent(
    {
      event: params.event,
      level: 'audit',
      command: {
        safeSummary: params.safeSummary,
        full: params.full,
        exitCode: params.exitCode,
        durationMs: params.durationMs ?? 0,
      },
      allowed: params.allowed,
    },
    params.projectDir,
  );
}
