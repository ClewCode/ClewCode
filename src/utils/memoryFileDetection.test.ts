import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { getClewConfigHomeDir } from './envUtils.js';
import { detectSessionFileType } from './memoryFileDetection.js';

describe('memory file detection', () => {
  it('detects session files inside the Clew config directory', () => {
    const configDir = getClewConfigHomeDir();
    expect(detectSessionFileType(join(configDir, 'projects', 'demo', 'session.jsonl'))).toBe('session_transcript');
    expect(detectSessionFileType(join(configDir, 'session-memory', 'summary.md'))).toBe('session_memory');
  });

  it('does not classify sibling directories that merely share the config prefix', () => {
    const configDir = getClewConfigHomeDir();
    expect(detectSessionFileType(join(`${configDir}-evil`, 'projects', 'demo', 'session.jsonl'))).toBeNull();
    expect(detectSessionFileType(join(`${configDir}-backup`, 'session-memory', 'summary.md'))).toBeNull();
  });
});
