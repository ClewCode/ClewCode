import { describe, expect, it, mock } from 'bun:test';

const scratchpadFile = '/scratch/session/scratchpad/notes.md';

// Enable the scratchpad gate for this suite. Spread the real module so the
// other exports keep working (bun mock.module replaces the whole module).
const realFs = await import('./permissions/filesystem.js');
mock.module('./permissions/filesystem.js', () => ({
  ...realFs,
  isScratchpadPath: (p: string) => p.startsWith('/scratch/session/scratchpad/'),
}));

const { getActiveToolSpinnerVerb } = await import('./activeToolSpinnerVerb.js');

describe('getActiveToolSpinnerVerb', () => {
  it('returns null when no relevant tools are active', () => {
    expect(getActiveToolSpinnerVerb([])).toBeNull();
    expect(getActiveToolSpinnerVerb([{ name: 'Read', input: { file_path: '/x' } }])).toBeNull();
  });

  it('describes a single scratchpad write with added line count', () => {
    const verb = getActiveToolSpinnerVerb([
      { name: 'Write', input: { file_path: scratchpadFile, content: 'a\nb\nc' } },
    ]);
    expect(verb).toBe('Making 1 scratchpad edit +3');
  });

  it('ignores non-scratchpad writes', () => {
    const verb = getActiveToolSpinnerVerb([{ name: 'Write', input: { file_path: '/repo/src/x.ts', content: 'a\nb' } }]);
    expect(verb).toBeNull();
  });

  it('counts shell commands (Bash + PowerShell)', () => {
    const verb = getActiveToolSpinnerVerb([
      { name: 'Bash', input: { command: 'ls' } },
      { name: 'PowerShell', input: { command: 'ls' } },
      { name: 'Bash', input: { command: 'pwd' } },
    ]);
    expect(verb).toBe('Running 3 shell commands');
  });

  it('combines scratchpad edits and shell commands', () => {
    const verb = getActiveToolSpinnerVerb([
      { name: 'Write', input: { file_path: scratchpadFile, content: Array(25).fill('x').join('\n') } },
      { name: 'Bash', input: { command: 'a' } },
      { name: 'Bash', input: { command: 'b' } },
      { name: 'Bash', input: { command: 'c' } },
    ]);
    expect(verb).toBe('Making 1 scratchpad edit +25, running 3 shell commands');
  });

  it('singularizes a single shell command', () => {
    const verb = getActiveToolSpinnerVerb([{ name: 'Bash', input: { command: 'a' } }]);
    expect(verb).toBe('Running 1 shell command');
  });
});
