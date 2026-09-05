import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFileAtomic } from './atomicFile.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('atomic runtime persistence', () => {
  test('replaces the destination and leaves no temporary file behind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'clew-atomic-runtime-'));
    roots.push(root);
    const file = join(root, 'state.json');

    await writeTextFileAtomic(file, '{"step":1}');
    await writeTextFileAtomic(file, '{"step":2}');

    expect(await readFile(file, 'utf8')).toBe('{"step":2}');
    expect((await readdir(root)).filter(name => name.includes('.tmp.'))).toEqual([]);
  });
});
