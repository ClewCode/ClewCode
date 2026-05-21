import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import { type CephMemoryConfig, getDefaultConfig } from './config.js';

export async function initMemoryWorkspace(cwd: string): Promise<CephMemoryConfig> {
  const fsImpl = getFsImplementation();
  const config = getDefaultConfig(cwd);

  const dirs = [
    join(cwd, '.ceph'),
    config.memoryDir,
    join(config.memoryDir, 'user'),
    join(config.memoryDir, 'project'),
    join(config.memoryDir, 'feedback'),
    join(config.memoryDir, 'agent'),
    join(config.memoryDir, 'pending'),
    config.wikiDir,
    join(config.wikiDir, 'Topics'),
    join(config.wikiDir, 'Sources'),
    join(config.wikiDir, 'Notes'),
    join(config.wikiDir, 'Decisions'),
    config.indexDir,
    config.runsDir,
  ];

  for (const dir of dirs) {
    if (!fsImpl.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  // Create default config.json
  const configPath = join(cwd, '.ceph', 'config.json');
  if (!fsImpl.existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  // Helper to create initial md files if they don't exist
  const createInitialFile = async (filePath: string, title: string, type: string, content: string) => {
    if (!fsImpl.existsSync(filePath)) {
      const defaultContent = [
        '---',
        `id: ceph:memory:${type}:${title.toLowerCase().replace(/\s+/g, '-')}`,
        `type: ${type}`,
        'scope: repo',
        'confidence: high',
        `created: ${new Date().toISOString()}`,
        `updated: ${new Date().toISOString()}`,
        '---',
        '',
        `# ${title}`,
        '',
        content,
      ].join('\n');
      await writeFile(filePath, defaultContent, 'utf-8');
    }
  };

  await createInitialFile(
    join(config.memoryDir, 'MEMORY.md'),
    'Project Memory',
    'project',
    'Welcome to your Markdown-first Project Memory. Edit this file to add general repository facts.',
  );

  await createInitialFile(
    join(config.memoryDir, 'user', 'preferences.md'),
    'User Preferences',
    'user',
    '- **Preferred Language:** TypeScript/JavaScript\n- **Styling Preference:** Vanilla CSS for premium look and feel.',
  );

  await createInitialFile(
    join(config.memoryDir, 'project', 'overview.md'),
    'Project Overview',
    'project',
    '- **Framework:** Bun/TypeScript/React\n- **System Architecture:** Offline-first coding assistant tools.',
  );

  await createInitialFile(
    join(config.memoryDir, 'feedback', 'corrections.md'),
    'User Feedback & Corrections',
    'feedback',
    'Record persistent corrections here to prevent AI agents from making the same mistake.',
  );

  await createInitialFile(
    join(config.memoryDir, 'agent', 'planner.md'),
    'Planner Agent Memory',
    'agent',
    'Agent specific instructions and context guidelines go here.',
  );

  return config;
}

export function getMemoryWorkspaceStatus(cwd: string): {
  initialized: boolean;
  memoryDir: string;
  wikiDir: string;
  indexDir: string;
  runsDir: string;
  configPath: string;
} {
  const fsImpl = getFsImplementation();
  const memoryDir = join(cwd, '.ceph', 'memory');
  const wikiDir = join(cwd, '.ceph', 'wiki');
  const indexDir = join(cwd, '.ceph', 'index');
  const runsDir = join(cwd, '.ceph', 'runs');
  const configPath = join(cwd, '.ceph', 'config.json');

  const initialized =
    fsImpl.existsSync(memoryDir) &&
    fsImpl.existsSync(wikiDir) &&
    fsImpl.existsSync(indexDir) &&
    fsImpl.existsSync(runsDir) &&
    fsImpl.existsSync(configPath);

  return {
    initialized,
    memoryDir,
    wikiDir,
    indexDir,
    runsDir,
    configPath,
  };
}
