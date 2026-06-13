import { mkdir } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';

export async function initWorkspace(cwd: string): Promise<void> {
  const fsImpl = getFsImplementation();
  const dirs = [
    join(cwd, DOT_CLEW),
    join(cwd, DOT_CLEW, 'research'),
    join(cwd, DOT_CLEW, 'research', 'runs'),
    join(cwd, DOT_CLEW, 'wiki'),
    join(cwd, DOT_CLEW, 'wiki', 'Research'),
    join(cwd, DOT_CLEW, 'memory'),
    join(cwd, DOT_CLEW, 'memory', 'pending'),
    join(cwd, DOT_CLEW, 'index'),
  ];

  for (const dir of dirs) {
    if (!fsImpl.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}

export async function getResearchWorkspaceStatus(cwd: string): Promise<{
  initialized: boolean;
  researchDir: string;
  runsDir: string;
  wikiResearchDir: string;
  pendingMemoryDir: string;
  indexDir: string;
}> {
  const fsImpl = getFsImplementation();
  const researchDir = join(cwd, DOT_CLEW, 'research');
  const runsDir = join(cwd, DOT_CLEW, 'research', 'runs');
  const wikiResearchDir = join(cwd, DOT_CLEW, 'wiki', 'Research');
  const pendingMemoryDir = join(cwd, DOT_CLEW, 'memory', 'pending');
  const indexDir = join(cwd, DOT_CLEW, 'index');

  const initialized =
    fsImpl.existsSync(researchDir) &&
    fsImpl.existsSync(runsDir) &&
    fsImpl.existsSync(wikiResearchDir) &&
    fsImpl.existsSync(pendingMemoryDir) &&
    fsImpl.existsSync(indexDir);

  return {
    initialized,
    researchDir,
    runsDir,
    wikiResearchDir,
    pendingMemoryDir,
    indexDir,
  };
}
