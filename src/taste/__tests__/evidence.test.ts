import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceCollector } from '../evidence/collector.js';
import { sanitizeEvidenceText } from '../evidence/sanitizer.js';
import { getSignalWeight, SIGNAL_WEIGHTS } from '../evidence/signals.js';
import { SqliteTasteStore } from '../store/sqlite-taste-store.js';

describe('Taste Evidence Subsystem', () => {
  let tempDir: string;
  let store: SqliteTasteStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'clew-evidence-test-'));
    store = new SqliteTasteStore({
      projectDbPath: join(tempDir, 'project-taste.db'),
      globalDbPath: join(tempDir, 'global-taste.db'),
    });
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('correctly maps signal weights according to the plan', () => {
    expect(SIGNAL_WEIGHTS.accept).toBe(0.3);
    expect(SIGNAL_WEIGHTS.reject).toBe(-0.4);
    expect(SIGNAL_WEIGHTS.revert).toBe(-0.7);
    expect(SIGNAL_WEIGHTS.test_pass).toBe(0.15);
    expect(SIGNAL_WEIGHTS.build_pass).toBe(0.1);
    expect(getSignalWeight('accept')).toBe(0.3);
    expect(getSignalWeight('accept', 0.5)).toBe(0.5);
  });

  it('sanitizes API keys, passwords, and private tokens from evidence payloads', () => {
    const raw = 'const key = "sk-ant-1234567890abcdef1234567890"; password: "supersecretpassword123";';
    const sanitized = sanitizeEvidenceText(raw);

    expect(sanitized).not.toContain('sk-ant-1234567890abcdef1234567890');
    expect(sanitized).not.toContain('supersecretpassword123');
    expect(sanitized).toContain('[REDACTED_SECRET]');
  });

  it('records and retrieves evidence linked to tasks and rules', async () => {
    const collector = new EvidenceCollector(store);

    const ev = await collector.record({
      taskId: 'task_100',
      ruleId: 'coding.named-exports',
      signal: 'accept',
      before: 'export default fn;',
      after: 'export function fn() {}',
      details: 'User accepted named export',
    });

    expect(ev.id).toBeDefined();
    expect(ev.weight).toBe(0.3);

    const history = await store.getEvidenceForRule('coding.named-exports');
    expect(history.length).toBe(1);
    expect(history[0]?.taskId).toBe('task_100');
    expect(history[0]?.signal).toBe('accept');
    expect(history[0]?.details).toBe('User accepted named export');
  });
});
