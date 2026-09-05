import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendClaimToRun, appendSourceToRun, createRunStore, getLatestRun, readSourcesFromRun } from './runStore.js';
import type { ResearchClaim, ResearchSource } from './types.js';

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'clew-research-run-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function source(id: string): ResearchSource {
  return {
    id,
    type: 'local_repo',
    title: id,
    path: `src/${id}.ts`,
    retrievedAt: new Date().toISOString(),
    trust: 'high',
  };
}

function claim(id: string, status: ResearchClaim['status'] = 'supported'): ResearchClaim {
  return {
    id,
    claim: id,
    type: 'fact',
    status,
    confidence: 'high',
    sourceIds: [],
  };
}

describe('research run persistence', () => {
  test('same query on the same day allocates a new run instead of truncating the previous run', async () => {
    const root = await tempRoot();
    const first = await createRunStore(root, 'same query', 'quick');
    await appendSourceToRun(first.runDir, source('first'));

    const second = await createRunStore(root, 'same query', 'quick');

    expect(second.runId).not.toBe(first.runId);
    expect(await readSourcesFromRun(first.runDir)).toHaveLength(1);
    expect(await readSourcesFromRun(second.runDir)).toHaveLength(0);
  });

  test('parallel source and claim writes do not lose run metadata increments', async () => {
    const root = await tempRoot();
    const run = await createRunStore(root, 'parallel collectors', 'deep');

    await Promise.all(Array.from({ length: 20 }, (_, i) => appendSourceToRun(run.runDir, source(`source-${i}`))));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        appendClaimToRun(run.runDir, claim(`claim-${i}`, i % 2 === 0 ? 'unsupported' : 'supported')),
      ),
    );

    const metadata = JSON.parse(await readFile(join(run.runDir, 'run.json'), 'utf8')) as {
      sourceCount: number;
      claimCount: number;
      unsupportedClaimCount: number;
    };
    expect(metadata.sourceCount).toBe(20);
    expect(metadata.claimCount).toBe(20);
    expect(metadata.unsupportedClaimCount).toBe(10);
  });

  test('latest run is selected by creation time, not query slug sort order', async () => {
    const root = await tempRoot();
    const first = await createRunStore(root, 'zzzz older', 'quick');
    await Bun.sleep(5);
    const second = await createRunStore(root, 'aaaa newer', 'quick');

    const latest = await getLatestRun(root);
    expect(latest?.run.id).toBe(second.runId);
    expect(latest?.run.id).not.toBe(first.runId);
  });
});
