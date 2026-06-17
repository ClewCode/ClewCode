import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { logError } from '../utils/log.js';
import { type ClaudeMemoryConfig, getDefaultConfig } from './config.js';
import { ingestMemoryWorkspace } from './ingest.js';

export async function initMemoryWorkspace(cwd: string): Promise<ClaudeMemoryConfig> {
  const fsImpl = getFsImplementation();
  const config = getDefaultConfig(cwd);

  const dirs = [
    join(cwd, DOT_CLEW),
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
  const configPath = join(cwd, DOT_CLEW, 'config.json');
  if (!fsImpl.existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  // Helper to create initial md files if they don't exist
  const createInitialFile = async (filePath: string, title: string, type: string, content: string) => {
    if (!fsImpl.existsSync(filePath)) {
      const defaultContent = [
        '---',
        `id: claude:memory:${type}:${title.toLowerCase().replace(/\s+/g, '-')}`,
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
  const memoryDir = join(cwd, DOT_CLEW, 'memory');
  const wikiDir = join(cwd, DOT_CLEW, 'wiki');
  const indexDir = join(cwd, DOT_CLEW, 'index');
  const runsDir = join(cwd, DOT_CLEW, 'runs');
  const configPath = join(cwd, DOT_CLEW, 'config.json');

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

export async function autoIngestWorkspaceMemory(cwd: string): Promise<void> {
  try {
    const status = getMemoryWorkspaceStatus(cwd);
    if (status.initialized) {
      const config = getDefaultConfig(cwd);
      // Run ingestion asynchronously in the background
      void ingestMemoryWorkspace(cwd, config).catch(err => {
        logError(new Error(`Failed to auto-ingest memory workspace: ${err.message}`));
      });
    }
  } catch (err: any) {
    logError(new Error(`Failed to check memory workspace status for auto-ingest: ${err.message}`));
  }
}
