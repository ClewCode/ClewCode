import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import * as pathsModule from '../../memdir/paths.js';
import { closeMemoryDb } from '../../memory/db.js';
import { listPending } from '../../memory/pending.js';
import { getMemoryWorkspaceStatus, initMemoryWorkspace } from '../../memory/workspace.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import * as fsPermsModule from '../../utils/permissions/filesystem.js';
import * as sideQueryModule from '../../utils/sideQuery.js';
import { consolidateSessionMemory, parseNotesSections } from './consolidation.js';

const tempCwd = join(process.cwd(), 'test/temp-test-consolidation');
const tempAutoMemDir = join(tempCwd, 'auto-mem-dir');
const tempSessionMemoryDir = join(tempCwd, 'session-mem-dir');
const tempSessionMemoryPath = join(tempSessionMemoryDir, 'summary.md');

describe('Memory Consolidation Service', () => {
  let sideQuerySpy: any;
  let getAutoMemPathSpy: any;
  let getSessionMemoryPathSpy: any;

  beforeAll(async () => {
    closeMemoryDb();
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(tempCwd)) {
      await rm(tempCwd, { recursive: true, force: true });
    }
    await mkdir(tempCwd, { recursive: true });
    await mkdir(tempSessionMemoryDir, { recursive: true });

    // Mock paths to use our temp testing directories
    getAutoMemPathSpy = spyOn(pathsModule, 'getAutoMemPath').mockReturnValue(tempAutoMemDir);
    getSessionMemoryPathSpy = spyOn(fsPermsModule, 'getSessionMemoryPath').mockReturnValue(tempSessionMemoryPath);
  });

  afterAll(async () => {
    closeMemoryDb();
    getAutoMemPathSpy.mockRestore();
    getSessionMemoryPathSpy.mockRestore();
    if (sideQuerySpy) sideQuerySpy.mockRestore();

    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(tempCwd)) {
      await rm(tempCwd, { recursive: true, force: true });
    }
  });

  test('parseNotesSections extracts content and ignores template hints', () => {
    const mockContent = `
# Session Title
_A short and distinctive 5-10 word descriptive title for the session_
My Cool Session

# Learnings
_What has worked well? What has not?_
- TypeScript is better than JS
- Vanilla CSS is premium

# Errors & Corrections
_Errors encountered_
- EIO error occurred on Windows
`;

    const sections = parseNotesSections(mockContent);
    expect(sections['Session Title']).toBe('My Cool Session');
    expect(sections['Learnings']).toBe('- TypeScript is better than JS\n- Vanilla CSS is premium');
    expect(sections['Errors & Corrections']).toBe('- EIO error occurred on Windows');
  });

  test('consolidateSessionMemory parses, requests LLM and saves/proposes memories', async () => {
    const mockContent = `
# Learnings
_What has worked well?_
- TypeScript is great
- Vanilla CSS is beautiful

# Errors & Corrections
_Errors encountered_
- EIO error occurred
`;

    await writeFile(tempSessionMemoryPath, mockContent, 'utf-8');

    // Mock sideQuery response
    sideQuerySpy = spyOn(sideQueryModule, 'sideQuery').mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            observations: [
              {
                fact: 'The user prefers Vanilla CSS over Tailwind.',
                category: 'user',
                why: 'User preference.',
              },
              {
                fact: 'Bun is used as the test runner.',
                category: 'project',
                why: 'Project architecture detail.',
              },
            ],
          }),
        },
      ],
    } as any);

    // Initialize local workspace memory under tempCwd
    const _config = await initMemoryWorkspace(tempCwd);
    expect(getMemoryWorkspaceStatus(tempCwd).initialized).toBe(true);

    // Run consolidation
    // Temporarily override process.cwd() or pass cwd if supported.
    // Since process.cwd() is tempCwd or we can change it in the test.
    const originalCwd = process.cwd;
    process.cwd = () => tempCwd;

    try {
      await consolidateSessionMemory();

      // Verify Auto-Memory file was written
      const sessionLearningsPath = join(tempAutoMemDir, 'session_learnings.md');
      const fsImpl = getFsImplementation();
      expect(fsImpl.existsSync(sessionLearningsPath)).toBe(true);

      const fileContent = await readFile(sessionLearningsPath, 'utf-8');
      expect(fileContent).toContain('## User Preferences');
      expect(fileContent).toContain('The user prefers Vanilla CSS over Tailwind.');
      expect(fileContent).toContain('## Project Overview');
      expect(fileContent).toContain('Bun is used as the test runner.');

      // Verify project observation was proposed to workspace pending
      const pendingList = await listPending(tempCwd);
      expect(pendingList.length).toBe(1);
      expect(pendingList[0].proposedFacts[0]).toBe('Bun is used as the test runner.');
      expect(pendingList[0].suggestedTarget).toBe('project/overview.md');
    } finally {
      process.cwd = originalCwd;
    }
  });
});
