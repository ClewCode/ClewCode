import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AuditEvent } from './types.js';
import { AuditLogWriter } from './writer.js';

let tempDirs: string[] = [];

function event(id: string): AuditEvent {
  return {
    timestamp: '2026-07-04T00:00:00.000Z',
    event: 'tool.result',
    level: 'audit',
    sessionId: 'session-1',
    user: 'tester',
    projectDir: '/repo',
    tool: {
      name: 'Read',
      durationMs: 12,
      allowed: true,
      reason: id,
    },
    classification: 'internal',
  };
}

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'clew-audit-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe('AuditLogWriter', () => {
  test('flushes buffered events on close', async () => {
    const projectDir = await tempProject();
    const writer = new AuditLogWriter({
      projectDir,
      config: { enabled: true, path: 'audit' },
    });

    await writer.init();
    writer.write(event('one'));
    await writer.close();

    const content = await readFile(join(projectDir, 'audit', 'audit.ndjson'), 'utf8');
    expect(content.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(content).tool.reason).toBe('one');
  });

  test('filters excluded events', async () => {
    const projectDir = await tempProject();
    const writer = new AuditLogWriter({
      projectDir,
      config: { enabled: true, path: 'audit', excludedEvents: ['tool.result'] },
    });

    await writer.init();
    writer.write(event('excluded'));
    await writer.close();

    const files = await readdir(join(projectDir, 'audit'));
    expect(files).not.toContain('audit.ndjson');
  });

  test('rotates existing log files when appending would exceed limit', async () => {
    const projectDir = await tempProject();
    const writer = new AuditLogWriter({
      projectDir,
      config: { enabled: true, path: 'audit', maxFileSizeBytes: 250, maxFiles: 3 },
    });

    await writer.init();
    writer.write(event('first'));
    await writer.flush();
    writer.write(event('second'));
    await writer.close();

    const files = await readdir(join(projectDir, 'audit'));
    expect(files).toContain('audit.ndjson');
    expect(files.some(file => /^audit\.\d+\.ndjson$/.test(file))).toBe(true);
  });
});
