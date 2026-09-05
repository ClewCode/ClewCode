import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDirectoriesToProcess } from './attachments.js';

describe('nested instruction directory containment', () => {
  test('does not treat a sibling with the same path prefix as nested under cwd', () => {
    const cwd = join(tmpdir(), 'clew-workspace');
    const siblingTarget = join(`${cwd}-evil`, 'nested', 'file.ts');

    const { nestedDirs } = getDirectoriesToProcess(siblingTarget, cwd);
    expect(nestedDirs).toEqual([]);
  });

  test('keeps genuine child directories ordered from cwd toward the target', () => {
    const cwd = join(tmpdir(), 'clew-workspace');
    const target = join(cwd, 'src', 'feature', 'file.ts');

    const { nestedDirs } = getDirectoriesToProcess(target, cwd);
    expect(nestedDirs).toEqual([join(cwd, 'src'), join(cwd, 'src', 'feature')]);
  });
});
