import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditToolCall, getAuditLogConfigFromEnv, getAuditLogWriter, isAuditLogEnabled } from './index.js';

const ENV_KEYS = [
  'CLEW_AUDIT_LOG',
  'CLEW_CODE_AUDIT_LOG',
  'CLEW_AUDIT_LOG_PATH',
  'CLEW_CODE_AUDIT_LOG_PATH',
  'CLEW_AUDIT_LOG_MAX_BYTES',
  'CLEW_AUDIT_LOG_MAX_FILES',
  'CLEW_AUDIT_LOG_INCLUDE',
  'CLEW_AUDIT_LOG_EXCLUDE',
  'CLEW_AUDIT_LOG_MIN_LEVEL',
  'CLEW_AUDIT_LOG_CONSOLE',
  'CLEW_AUDIT_USER',
] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map(key => [key, process.env[key]]));
let tempDirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'clew-audit-service-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('audit log service', () => {
  test('is disabled by default', () => {
    delete process.env.CLEW_AUDIT_LOG;
    delete process.env.CLEW_CODE_AUDIT_LOG;
    expect(isAuditLogEnabled()).toBe(false);
  });

  test('reads env configuration', () => {
    process.env.CLEW_AUDIT_LOG = '1';
    process.env.CLEW_AUDIT_LOG_MAX_BYTES = '1234';
    process.env.CLEW_AUDIT_LOG_INCLUDE = 'tool.call,tool.result';
    process.env.CLEW_AUDIT_LOG_MIN_LEVEL = 'audit';

    expect(getAuditLogConfigFromEnv()).toMatchObject({
      enabled: true,
      maxFileSizeBytes: 1234,
      includedEvents: ['tool.call', 'tool.result'],
      minLevel: 'audit',
    });
  });

  test('writes a tool audit event when enabled', async () => {
    const projectDir = await tempProject();
    process.env.CLEW_AUDIT_LOG = '1';
    process.env.CLEW_AUDIT_LOG_PATH = 'audit';
    process.env.CLEW_AUDIT_USER = 'audit-user';

    auditToolCall({
      toolName: 'Bash',
      input: { command: 'npm test' },
      allowed: true,
      event: 'tool.call',
      projectDir,
    });

    await getAuditLogWriter(projectDir)?.flush();
    const content = await readFile(join(projectDir, 'audit', 'audit.ndjson'), 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.event).toBe('tool.call');
    expect(parsed.user).toBe('audit-user');
    expect(parsed.tool.name).toBe('Bash');
  });
});
