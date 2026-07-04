import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDeclaredLinks,
  getLinkedDirs,
  linkProjects,
  readWorkspaceFile,
  unlinkProjects,
  writeWorkspaceLinks,
} from './workspace.js';

describe('workspace linking', () => {
  let root: string;
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'clew-ws-'));
    repoA = join(root, 'a');
    repoB = join(root, 'b');
    mkdirSync(repoA, { recursive: true });
    mkdirSync(repoB, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null when no workspace file exists', () => {
    expect(readWorkspaceFile(repoA)).toBeNull();
    expect(getDeclaredLinks(repoA)).toEqual([]);
  });

  it('links two repos bidirectionally', () => {
    const result = linkProjects(repoA, repoB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyLinked).toBe(false);
    }
    expect(getDeclaredLinks(repoA)).toContain(repoB);
    expect(getDeclaredLinks(repoB)).toContain(repoA);
    expect(existsSync(join(repoA, '.clew', 'workspace.json'))).toBe(true);
  });

  it('reports alreadyLinked on repeat and does not duplicate', () => {
    linkProjects(repoA, repoB);
    const again = linkProjects(repoA, repoB);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.alreadyLinked).toBe(true);
    }
    expect(getDeclaredLinks(repoA)).toEqual([repoB]);
  });

  it('rejects self-links and missing paths', () => {
    expect(linkProjects(repoA, repoA)).toMatchObject({ ok: false, reason: 'self' });
    expect(linkProjects(repoA, join(root, 'nope'))).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('unlinks from both sides', () => {
    linkProjects(repoA, repoB);
    const res = unlinkProjects(repoA, repoB);
    expect(res.wasLinked).toBe(true);
    expect(getDeclaredLinks(repoA)).toEqual([]);
    expect(getDeclaredLinks(repoB)).toEqual([]);
  });

  it('unlink reports wasLinked=false when no link exists', () => {
    expect(unlinkProjects(repoA, repoB).wasLinked).toBe(false);
  });

  it('getLinkedDirs filters out self and non-existent dirs', () => {
    const ghost = join(root, 'ghost');
    writeWorkspaceLinks(repoA, [repoB, ghost, repoA]);
    const linked = getLinkedDirs(repoA);
    expect(linked).toContain(repoB);
    expect(linked).not.toContain(ghost);
    expect(linked).not.toContain(repoA);
  });

  it('tolerates malformed workspace.json', () => {
    const file = join(repoA, '.clew', 'workspace.json');
    mkdirSync(join(repoA, '.clew'), { recursive: true });
    writeFileSync(file, '{ not valid json', 'utf8');
    expect(readWorkspaceFile(repoA)).toBeNull();
  });
});
