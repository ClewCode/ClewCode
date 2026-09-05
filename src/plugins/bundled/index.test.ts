import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHooks } from './index.js';

describe('bundled plugin hook loading', () => {
  let root = '';

  beforeEach(() => {
    root = join(tmpdir(), `clew-builtin-plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(join(root, 'hooks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns undefined instead of crashing when hooks.json is malformed', () => {
    writeFileSync(join(root, 'hooks', 'hooks.json'), '{"hooks":', 'utf8');

    expect(() => loadHooks(root)).not.toThrow();
    expect(loadHooks(root)).toBeUndefined();
  });

  it('loads valid hooks.json content', () => {
    const hooks = { PreToolUse: [] };
    writeFileSync(join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks }), 'utf8');

    expect(loadHooks(root)).toEqual(hooks);
  });
});
