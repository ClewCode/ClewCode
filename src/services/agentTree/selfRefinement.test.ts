import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approveAndApply, rollBack, submitRefinement } from './selfRefinement.js';

const work = mkdtempSync(join(tmpdir(), 'refine-'));
const projectDir = work;
const target = join(work, 'skills', 'deploy.md');
mkdirSync(join(work, 'skills'), { recursive: true });
writeFileSync(target, '# deploy\nold step\n');

afterEach(() => {
  writeFileSync(target, '# deploy\nold step\n');
});

// NOTE: no bottom-of-file rmSync — bun executes top-level statements before
// tests run, and a sync rm here deletes the fixture out from under the suite.

describe('selfRefinement', () => {
  test('rejects proposals without provenance reason or missing target', () => {
    writeFileSync(target, '# deploy\nold step\n');
    const base = {
      proposedByAgentId: 'agent-1',
      target: { type: 'skill' as const, path: target },
      afterContent: '# deploy\nnew step\n',
    };
    expect(() => submitRefinement({ ...base, reason: '' }, projectDir)).toThrow(/reason/);
    expect(() =>
      submitRefinement(
        { ...base, target: { type: 'skill', path: join(work, 'nope.md') }, reason: 'update' },
        projectDir,
      ),
    ).toThrow(/does not exist/);
  });

  test('failing verifier blocks apply; passing verifier applies', () => {
    writeFileSync(target, '# deploy\nold step\n');
    const p = submitRefinement(
      {
        proposedByAgentId: 'agent-1',
        reason: 'new rollout flag',
        target: { type: 'skill', path: target },
        afterContent: '# deploy\nnew step\n',
        verifierCommand: 'exit 3',
      },
      projectDir,
    );
    expect(() => approveAndApply(p.id, projectDir)).toThrow(/verifier failed/);
    // exempt path still applies
    approveAndApply(p.id, projectDir, { skipVerifier: true });
    expect(readFileSync(target, 'utf8')).toContain('new step');
  });

  test('rollback restores exact original bytes', () => {
    writeFileSync(target, '# deploy\nold step\n');
    const p = submitRefinement(
      {
        proposedByAgentId: 'agent-2',
        reason: 'replace flow',
        target: { type: 'skill', path: target },
        afterContent: '# deploy\nbrand new\n',
      },
      projectDir,
    );
    approveAndApply(p.id, projectDir);
    rollBack(p.id, projectDir);
    expect(readFileSync(target, 'utf8')).toBe('# deploy\nold step\n');
  });
});
