import { readFile, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { DOT_CLEW, MEMORY_DIR } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { getMemoryDb } from './db.js';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js';
import { deleteSource, getAllSources } from './store.js';
import type { MemoryMetadata, MemoryType } from './types.js';

export interface PendingSuggestion {
  id: string;
  filePath: string;
  suggestedTarget: string;
  proposedFacts: string[];
  why: string;
  createdAt: string;
}

export async function proposeMemory(
  cwd: string,
  observation: string,
  target: 'user' | 'project' | 'feedback' | 'agent' = 'project',
): Promise<string> {
  const fsImpl = getFsImplementation();
  const pendingDir = join(cwd, DOT_CLEW, 'memory', 'pending');

  const date = new Date().toISOString().slice(0, 10);
  const randomSlug = Math.random().toString(36).substring(2, 7);
  const pendingFileName = `${date}-${randomSlug}.md`;
  const pendingFilePath = join(pendingDir, pendingFileName);

  const pendingId = `claude:pending:${date}:${randomSlug}`;

  const metadata: MemoryMetadata = {
    id: pendingId,
    type: 'pending',
    suggested_target: `${target}/overview.md`,
    confidence: 'high',
    created: new Date().toISOString(),
  };

  const body = [
    '# Pending Memory Suggestion',
    '',
    '## Suggested Memory',
    '',
    `- ${observation}`,
    '',
    '## Why',
    '',
    'Suggested dynamically from agent observation during execution.',
  ].join('\n');

  const content = stringifyFrontmatter(metadata, body);
  await writeFile(pendingFilePath, content, 'utf-8');

  return pendingId;
}

export async function listPending(cwd: string): Promise<PendingSuggestion[]> {
  const fsImpl = getFsImplementation();
  const pendingDir = join(cwd, DOT_CLEW, 'memory', 'pending');
  if (!fsImpl.existsSync(pendingDir)) return [];

  const files = fsImpl.readdirSync(pendingDir);
  const suggestions: PendingSuggestion[] = [];

  for (const file of files) {
    const filename = typeof file === 'string' ? file : file.name;
    if (!filename.endsWith('.md')) continue;

    const filePath = join(pendingDir, filename);
    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = parseFrontmatter(content, `claude:pending:${filename}`, 'pending');

      const facts: string[] = [];
      const lines = parsed.content.split('\n');
      let collectFacts = false;

      for (const line of lines) {
        if (line.startsWith('## Suggested Memory')) {
          collectFacts = true;
          continue;
        }
        if (line.startsWith('## Why')) {
          collectFacts = false;
        }
        if (collectFacts && line.trim().startsWith('-')) {
          facts.push(line.trim().slice(1).trim());
        }
      }

      suggestions.push({
        id: parsed.metadata.id,
        filePath,
        suggestedTarget: parsed.metadata.suggested_target || 'project/overview.md',
        proposedFacts: facts,
        why: 'Suggested dynamically from agent observation.',
        createdAt: parsed.metadata.created || new Date().toISOString(),
      });
    } catch {
      // Ignore malformed files
    }
  }

  return suggestions;
}

export async function approveMemory(cwd: string, pendingId: string): Promise<string> {
  const fsImpl = getFsImplementation();
  const suggestions = await listPending(cwd);
  const matched = suggestions.find(s => s.id === pendingId || basename(s.filePath, '.md').includes(pendingId));

  if (!matched) {
    throw new Error(`Pending memory suggestion with ID "${pendingId}" not found.`);
  }

  const targetPath = join(cwd, DOT_CLEW, 'memory', matched.suggestedTarget);

  let targetMetadata: MemoryMetadata = {
    id: `claude:memory:${matched.suggestedTarget.replace(/\//g, ':').replace(/\.md$/, '')}`,
    type: matched.suggestedTarget.split('/')[0] as MemoryType,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  let targetBody = '';

  if (fsImpl.existsSync(targetPath)) {
    const rawContent = await readFile(targetPath, 'utf-8');
    const parsedTarget = parseFrontmatter(rawContent, targetMetadata.id, targetMetadata.type);
    targetMetadata = parsedTarget.metadata;
    targetBody = parsedTarget.content;
  }

  // Append new facts cleanly
  const factsText = matched.proposedFacts.map(fact => `- ${fact}`).join('\n');
  const separator = targetBody.includes('## Facts') ? '' : '\n## Facts\n';
  const updatedBody = `${targetBody}${separator}\n${factsText}`.trim();

  targetMetadata.updated = new Date().toISOString();
  const updatedContent = stringifyFrontmatter(targetMetadata, updatedBody);

  await writeFile(targetPath, updatedContent, 'utf-8');
  await unlink(matched.filePath);

  // Sync DB records
  const db = getMemoryDb(cwd);
  deleteSource(db, pendingId);

  return targetPath;
}

export async function rejectMemory(cwd: string, pendingId: string): Promise<void> {
  const suggestions = await listPending(cwd);
  const matched = suggestions.find(s => s.id === pendingId || basename(s.filePath, '.md').includes(pendingId));

  if (!matched) {
    throw new Error(`Pending memory suggestion with ID "${pendingId}" not found.`);
  }

  await unlink(matched.filePath);

  const db = getMemoryDb(cwd);
  deleteSource(db, pendingId);
}

export async function forgetMemory(cwd: string, memoryId: string): Promise<void> {
  const fsImpl = getFsImplementation();
  const db = getMemoryDb(cwd);

  const sources = getAllSources(db);
  const matched = sources.find(s => s.id === memoryId || s.uri.includes(memoryId));

  if (matched && matched.sourcePath && fsImpl.existsSync(matched.sourcePath)) {
    await unlink(matched.sourcePath);
  }

  if (matched) {
    deleteSource(db, matched.id);
  }
}
