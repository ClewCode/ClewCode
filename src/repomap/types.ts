/**
 * Data contracts and configuration types for the Aider-style Repo Map system.
 */

export type SymbolKind = 'interface' | 'type' | 'class' | 'function' | 'const' | 'enum';

export interface SymbolSignature {
  name: string;
  kind: SymbolKind;
  signature: string;
  exported: boolean;
  line: number;
}

export interface FileSignatures {
  filePath: string;
  mtimeMs: number;
  symbols: SymbolSignature[];
  tokenEstimate: number;
}

export interface RepoMapCache {
  version: number;
  lastUpdated: string;
  files: Record<string, FileSignatures>;
}

export interface RepoMapConfig {
  maxTokens: number;
  maxFiles: number;
  includePatterns: string[];
  excludePatterns: string[];
  enabled: boolean;
}

export const DEFAULT_REPOMAP_CONFIG: RepoMapConfig = {
  maxTokens: 1500,
  maxFiles: 50,
  includePatterns: ['src/**/*.{ts,tsx,js,jsx,py,go,rs}'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.test.*', '**/*.spec.*', '**/__tests__/**'],
  enabled: true,
};
