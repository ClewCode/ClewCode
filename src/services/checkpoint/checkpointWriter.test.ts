import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
  process.env.CLEW_CONFIG_DIR = dir;
});

afterAll(() => {
  delete process.env.CLEW_CONFIG_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function assistantMsg(blocks: unknown[]) {
  return { type: 'assistant', message: { content: blocks } };
}

describe('extractCheckpointSignals', () => {
  it('extracts decisions, commands, and modified files from message tail', async () => {
    const { extractCheckpointSignals } = await import('./checkpointWriter.js');
    const messages = [
      { type: 'user', message: { content: 'fix the bug' } },
      assistantMsg([
        { type: 'text', text: "I'll start by reading the config loader." },
        { type: 'tool_use', name: 'Bash', input: { command: 'bun test src/utils' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/a.ts' } },
        { type: 'tool_use', name: 'Write', input: { file_path: '/repo/src/b.ts' } },
        { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/src/a.ts' } },
      ]),
    ];

    const signals = extractCheckpointSignals(messages);
    expect(signals.decisions).toHaveLength(1);
    expect(signals.decisions[0]).toContain('config loader');
    expect(signals.commandsRun).toEqual(['bun test src/utils']);
    expect(signals.filesModified).toEqual(['/repo/src/a.ts', '/repo/src/b.ts']);
  });

  it('handles malformed messages without throwing', async () => {
    const { extractCheckpointSignals } = await import('./checkpointWriter.js');
    const signals = extractCheckpointSignals([
      { type: 'assistant' },
      { type: 'assistant', message: { content: 'plain string' } },
      assistantMsg([null, { type: 'tool_use', name: 'Bash', input: {} }]),
    ] as never[]);
    expect(signals.decisions).toEqual([]);
    expect(signals.commandsRun).toEqual([]);
    expect(signals.filesModified).toEqual([]);
  });
});

describe('writeCompactionCheckpoint', () => {
  it('writes a checkpoint retrievable via getLatestCheckpoint', async () => {
    const { writeCompactionCheckpoint, getLatestCheckpoint } = await import('./checkpointWriter.js');
    const messages = [
      { type: 'user', message: { content: 'do the thing' } },
      assistantMsg([
        { type: 'text', text: 'Let me plan the migration steps.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'git status' } },
      ]),
      { type: 'user', message: { content: 'continue' } },
    ];

    await writeCompactionCheckpoint(messages, 'ship the feature');

    const latest = await getLatestCheckpoint();
    expect(latest).not.toBeNull();
    expect(latest!.goalText).toBe('ship the feature');
    expect(latest!.progressPercent).toBe(100);
    expect(latest!.turnCount).toBe(2);
    expect(latest!.commandsRun).toEqual(['git status']);
    expect(latest!.cycle).toBeGreaterThanOrEqual(1);

    // UI summary is exposed for the compact boundary message
    const { getLastCompactionCheckpointInfo } = await import('./checkpointWriter.js');
    const info = getLastCompactionCheckpointInfo();
    expect(info).not.toBeNull();
    expect(info!.commandsRun).toBe(1);
    expect(info!.cycle).toBe(latest!.cycle);
  });

  it('uses a default goal text when none is active', async () => {
    const { writeCompactionCheckpoint, getLatestCheckpoint } = await import('./checkpointWriter.js');
    await writeCompactionCheckpoint([{ type: 'user', message: { content: 'hi' } }]);
    const latest = await getLatestCheckpoint();
    expect(latest!.goalText).toContain('compaction');
  });
});
