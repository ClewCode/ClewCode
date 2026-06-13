import { join } from 'path';
import { DOT_CLEW, INDEX_DIR, MEMORY_DIR, RUNS_DIR, WIKI_DIR } from '../utils/clewPaths.js';

export interface ClaudeMemoryConfig {
  enabled: boolean;
  rootDir: string;
  memoryDir: string;
  wikiDir: string;
  indexDir: string;
  runsDir: string;
  maxChunkTokens: number;
  redactSecrets: boolean;
  autoCapture: boolean;
  autoSync: boolean;
  includeGitHistory: boolean;
  includeGithub: boolean;
  includeLogs: boolean;
  excludeGlobs: string[];
}

export function getDefaultConfig(rootDir: string): ClaudeMemoryConfig {
  return {
    enabled: true,
    rootDir,
    memoryDir: join(rootDir, DOT_CLEW, MEMORY_DIR),
    wikiDir: join(rootDir, DOT_CLEW, WIKI_DIR),
    indexDir: join(rootDir, DOT_CLEW, INDEX_DIR),
    runsDir: join(rootDir, DOT_CLEW, RUNS_DIR),
    maxChunkTokens: 3000,
    redactSecrets: true,
    autoCapture: true,
    autoSync: false,
    includeGitHistory: false,
    includeGithub: false,
    includeLogs: true,
    excludeGlobs: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.cache/**',
      '**/*.pem',
      '**/*.key',
      '**/*.p12',
      '**/*.pfx',
      '**/id_rsa',
      '**/id_ed25519',
      '**/.env',
      '**/.env.*',
    ],
  };
}
