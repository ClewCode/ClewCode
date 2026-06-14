import { describe, expect, test } from 'bun:test';
import { buildCodexExecArgs, buildCodexPtyArgs, tailPtyOutput } from './ProcessMeshProvider.js';

describe('tailPtyOutput', () => {
  test('preserves SGR color while limiting recent lines', () => {
    const output = Array.from({ length: 20 }, (_, index) => `\u001B[3${index % 7}mline ${index}\u001B[0m`).join('\n');

    expect(tailPtyOutput(output, 3)).toBe(
      '\u001B[33mline 17\u001B[0m\n\u001B[34mline 18\u001B[0m\n\u001B[35mline 19\u001B[0m',
    );
  });

  test('normalizes carriage returns and removes unsupported terminal controls', () => {
    expect(tailPtyOutput('first\rsecond\x1b[2J\x1b[1A\bdone')).toBe('first\nseconddone');
  });
});

describe('buildCodexExecArgs', () => {
  test('builds a one-shot codex exec invocation for a workspace task', () => {
    expect(buildCodexExecArgs({ prompt: 'fix the failing test', cwd: '/repo' })).toEqual([
      'exec',
      '-C',
      '/repo',
      '--color',
      'never',
      '-',
    ]);
  });

  test('includes model when provided', () => {
    expect(buildCodexExecArgs({ prompt: 'review this diff', cwd: '/repo', model: 'gpt-5-codex' })).toEqual([
      'exec',
      '-C',
      '/repo',
      '--color',
      'never',
      '-m',
      'gpt-5-codex',
      '-',
    ]);
  });

  test('builds PTY invocation with prompt as an argument so the process can exit', () => {
    expect(buildCodexPtyArgs({ prompt: 'reply ok', cwd: '/repo' })).toEqual([
      'exec',
      '-C',
      '/repo',
      '--color',
      'never',
      'reply ok',
    ]);
  });
});
