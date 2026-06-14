/**
 * Auto-Extraction Engine — automatically extracts key facts from
 * conversations and saves them as long-term memories.
 *
 * Triggered at:
 * - Session end (auto)
 * - Manual: /memory extract
 * - Periodic: every N messages during long sessions
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { getFsImplementation } from '../../utils/fsOperations.js';

// ── Types ──

export interface ExtractedMemory {
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description: string;
  content: string;
  /** Comma-separated tags for topic indexing */
  tags: string[];
  /** Confidence 0-1 */
  confidence: number;
}

export interface ExtractionResult {
  memories: ExtractedMemory[];
  summary: string;
  keyDecisions: string[];
  activeFiles: string[];
}

// ── Paths ──

function getMemoryDir(projectRoot: string): string {
  const base = getClaudeConfigHomeDir();
  return join(base, 'projects', sanitizePath(projectRoot), 'memory');
}

function sanitizePath(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

// ── Save ──

/**
 * Save extracted memories to the long-term memory store.
 * Each memory becomes a markdown file with frontmatter.
 * Returns the number of memories saved.
 */
export async function saveExtractedMemories(
  projectRoot: string,
  result: ExtractionResult,
): Promise<number> {
  const memDir = getMemoryDir(projectRoot);
  if (!existsSync(memDir)) {
    await mkdir(memDir, { recursive: true });
  }

  let saved = 0;
  for (const mem of result.memories) {
    if (mem.confidence < 0.5) continue; // Skip low-confidence

    // Build a safe filename from the memory name
    const safeName = sanitizePath(mem.name.toLowerCase().replace(/\s+/g, '-')).slice(0, 60);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${date}-${safeName}.md`;
    const filePath = join(memDir, mem.type, filename);

    // Create type subdirectory if needed
    const dir = join(memDir, mem.type);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Check for duplicate by name
    if (existsSync(filePath)) {
      // Append to existing instead of overwriting
      const existing = await readFileContent(filePath);
      const updated = existing + `\n\n---\n*Updated ${new Date().toISOString()}*\n\n${mem.content}`;
      await writeFile(filePath, updated, 'utf8');
    } else {
      const frontmatter = [
        '---',
        `name: ${mem.name}`,
        `description: ${mem.description}`,
        `type: ${mem.type}`,
        `tags: [${mem.tags.join(', ')}]`,
        `created: ${new Date().toISOString()}`,
        `confidence: ${mem.confidence}`,
        '---',
        '',
        mem.content,
      ].join('\n');
      await writeFile(filePath, frontmatter, 'utf8');
    }
    saved++;
  }

  return saved;
}

async function readFileContent(path: string): Promise<string> {
  try {
    const fs = getFsImplementation();
    return await fs.readFile(path, { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

// ── Stats ──

export async function getMemoryStats(projectRoot: string): Promise<{
  total: number;
  byType: Record<string, number>;
  totalSize: number;
}> {
  const memDir = getMemoryDir(projectRoot);
  if (!existsSync(memDir)) {
    return { total: 0, byType: {}, totalSize: 0 };
  }

  const fs = getFsImplementation();
  const types = ['user', 'feedback', 'project', 'reference'];
  const byType: Record<string, number> = {};
  let total = 0;

  for (const t of types) {
    const dir = join(memDir, t);
    if (!existsSync(dir)) {
      byType[t] = 0;
      continue;
    }
    try {
      const files = await readDir(dir);
      const mdFiles = files.filter((f: string) => f.endsWith('.md'));
      byType[t] = mdFiles.length;
      total += mdFiles.length;
    } catch {
      byType[t] = 0;
    }
  }

  return { total, byType, totalSize: 0 };
}

// Wrap fs promises for compatibility
async function readDir(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  return readdir(dir);
}
