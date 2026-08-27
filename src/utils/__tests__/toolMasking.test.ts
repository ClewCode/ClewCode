import { describe, expect, it } from 'bun:test';
import type { Tool, Tools } from '../../Tool.js';
import { filterToolsByMask, isToolAllowedInMode } from '../toolMasking.js';

describe('Dynamic Tool Masking', () => {
  const createMockTool = (name: string): Tool =>
    ({
      name,
      description: `Tool ${name}`,
      inputSchema: {},
      outputSchema: {},
      isEnabled: () => true,
      userFacingName: () => name,
      isReadOnly: () => name === 'FileRead' || name === 'Grep',
    }) as unknown as Tool;

  const mockTools: Tools = [
    createMockTool('FileRead'),
    createMockTool('FileEdit'),
    createMockTool('FileWrite'),
    createMockTool('Bash'),
    createMockTool('Grep'),
    createMockTool('Glob'),
    createMockTool('AskUserQuestion'),
  ];

  it('keeps all tools in default mode', () => {
    const filtered = filterToolsByMask(mockTools, 'default');
    expect(filtered.length).toBe(mockTools.length);
  });

  it('masks destructive write/exec tools in plan mode', () => {
    const filtered = filterToolsByMask(mockTools, 'plan');
    const names = filtered.map(t => t.name);

    expect(names).toContain('FileRead');
    expect(names).toContain('Grep');
    expect(names).toContain('Glob');
    expect(names).toContain('AskUserQuestion');

    expect(names).not.toContain('FileEdit');
    expect(names).not.toContain('FileWrite');
    expect(names).not.toContain('Bash');
  });

  it('masks destructive write/exec tools in read-only mode', () => {
    const filtered = filterToolsByMask(mockTools, 'read-only');
    const names = filtered.map(t => t.name);

    expect(names).toContain('FileRead');
    expect(names).toContain('Grep');
    expect(names).not.toContain('FileEdit');
    expect(names).not.toContain('FileWrite');
    expect(names).not.toContain('Bash');
  });

  it('returns only core tools in minimal mode', () => {
    const filtered = filterToolsByMask(mockTools, 'minimal');
    const names = filtered.map(t => t.name);

    expect(names).toContain('FileRead');
    expect(names).toContain('FileEdit');
    expect(names).toContain('Bash');
    expect(names).toContain('Grep');
  });

  it('correctly checks isToolAllowedInMode', () => {
    expect(isToolAllowedInMode('FileRead', 'plan')).toBe(true);
    expect(isToolAllowedInMode('FileEdit', 'plan')).toBe(false);
    expect(isToolAllowedInMode('Bash', 'read-only')).toBe(false);
    expect(isToolAllowedInMode('Bash', 'default')).toBe(true);
  });
});
