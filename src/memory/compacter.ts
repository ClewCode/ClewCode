/**
 * Memory Compacter — turn session context into durable memories.
 *
 * Used by:
 * 1. `/compact` hook — auto-extracts after context compaction
 * 2. `autoExtractFromSession()` — called externally to save session context
 */

import { readFile, writeFile, appendFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { MemoryDB } from './database.js';
import { writeMemoryFile, getMemoryDirPath } from './hierarchy.js';
import type { MemoryType } from './schema.js';

export type CompactEntry = {
  key: string;
  type: MemoryType | 'task_progress' | 'command' | 'note';
  content: string;
  importance: number;
  confidence: number;
};

export type CompactResult = {
  created: number;
  updated: number;
  unchanged: number;
  entries: Array<{
    key: string;
    type: string;
    action: 'created' | 'updated' | 'unchanged';
    targetFile: string;
  }>;
  filesUpdated: string[];
};

// Types that go to markdown files
const FILE_ROUTES: Record<string, string> = {
  decision: 'DECISIONS.md',
  taste: 'TASTE.md',
  architecture: 'MEMORY.md',
  task_progress: 'MEMORY.md',
  command: 'MEMORY.md',
  note: 'MEMORY.md',
  bug: 'MEMORY.md',
};

/**
 * Auto-extract durable memories from current session context.
 * Called after `/compact` completes.
 *
 * Collects goal text, checkpoint notes, and optionally pre-extracted
 * memory lines from the compact LLM response — then saves as durable memories.
 *
 * @param memoryLines Optional pre-extracted tagged lines from compact response
 */
export async function autoExtractFromSession(memoryLines?: string[]): Promise<CompactResult | null> {
  if (!MemoryDB.isInitialized()) return null;

  const contextParts: string[] = [];

  // 1. Pre-extracted memories from compact LLM (highest quality)
  if (memoryLines && memoryLines.length > 0) {
    contextParts.push(...memoryLines);
  }

  // 2. Goal
  try {
    const { getSessionGoal } = await import('../utils/sessionGoalState.js');
    const goal = getSessionGoal();
    if (goal) {
      contextParts.push(`[task_progress] ${goal}`);
    }
  } catch {
    // goal system unavailable
  }

  // 3. Checkpoint notes
  try {
    const { readNotes } = await import('../services/checkpoint/checkpointWriter.js');
    const notes = await readNotes();
    if (notes) {
      const lines = notes.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const clean = line.replace(/^-\s*/, '').trim();
        if (clean) contextParts.push(`[note] ${clean}`);
      }
    }
  } catch {
    // checkpoint system unavailable
  }

  if (contextParts.length === 0) return null;

  return compactContext(contextParts.join('\n'), false);
}

/**
 * Slugify a string for use as part of a deterministic key.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/**
 * Build a deterministic key from type and description.
 */
function buildKey(type: string, description: string): string {
  const slug = slugify(description);
  return `${type}.${slug}`;
}

/**
 * Format a compact entry as a markdown line for file appending.
 */
function formatFileEntry(entry: CompactEntry): string {
  const date = new Date().toISOString().slice(0, 10);
  return `\n- [${date}] [${entry.type}] ${entry.content}`;
}

/**
 * Compact session context into durable memories.
 *
 * @param context  Free-text description of what happened this session.
 * @param dryRun   If true, show what would be written without writing.
 * @returns CompactResult with counts and per-entry details.
 */
export async function compactContext(
  context: string,
  dryRun = false,
): Promise<CompactResult> {
  const entries = classifyContext(context);
  const result: CompactResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    entries: [],
    filesUpdated: [],
  };

  const fileBuffers = new Map<string, string[]>();

  for (const entry of entries) {
    const targetFile = FILE_ROUTES[entry.type] ?? 'MEMORY.md';

    if (dryRun) {
      result.entries.push({
        key: entry.key,
        type: entry.type,
        action: 'created',
        targetFile,
      });
      result.created++;
      continue;
    }

    // Upsert into MemoryDB
    const dbResult = MemoryDB.getInstance().upsertMemory({
      key: entry.key,
      projectPath: getCwd(),
      type: entry.type as MemoryType,
      content: entry.content,
      importance: entry.importance,
      confidence: entry.confidence,
    });

    if (dbResult.action === 'created') result.created++;
    else if (dbResult.action === 'updated') result.updated++;
    else result.unchanged++;

    result.entries.push({
      key: entry.key,
      type: entry.type,
      action: dbResult.action,
      targetFile,
    });

    // Buffer for markdown file update
    if (dbResult.action !== 'unchanged') {
      const lines = fileBuffers.get(targetFile) ?? [];
      lines.push(formatFileEntry(entry));
      fileBuffers.set(targetFile, lines);
    }
  }

  // Write markdown files
  if (!dryRun) {
    for (const [file, lines] of fileBuffers) {
      const filePath = join(getMemoryDirPath(), file);
      if (existsSync(filePath)) {
        await appendFile(filePath, lines.join(''), 'utf8');
      } else {
        const header = file === 'DECISIONS.md'
          ? '# Architecture Decisions\n'
          : file === 'TASTE.md'
            ? '# Coding Style & Preferences\n'
            : '# Project Memory\n';
        await writeFile(filePath, header + lines.join(''), 'utf8');
      }
      result.filesUpdated.push(file);
    }
  }

  return result;
}

/**
 * Classify a free-text context string into compact entries.
 *
 * Parses tagged lines like:
 *   [decision] description
 *   [architecture] description
 *   [taste] description
 *   [bug] description
 *   [task] description
 *   [command] description
 *   [note] description
 *
 * Untagged lines are classified heuristically.
 */
export function classifyContext(context: string): CompactEntry[] {
  // Extract all [tag] content patterns from the text.
  // Supports multiple tags on one line: "[decision] foo [architecture] bar"
  // and untagged lines become "note" entries.
  const TAG_GLOBAL = /\[(\w+)\]\s+([^[]+?)(?=\s*\[|$)/g;
  const seen = new Set<string>();
  const entries: CompactEntry[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = TAG_GLOBAL.exec(context)) !== null) {
    lastIndex = match.index + match[0].length;
    const type = match[1]!.toLowerCase();
    const text = match[2]!.trim();

    // Validate type
    const validTypes = ['decision', 'architecture', 'taste', 'bug', 'task_progress', 'command', 'note'];
    const normalizedType = validTypes.includes(type) ? type : 'note';

    const key = buildKey(normalizedType, text);
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      key,
      type: normalizedType as CompactEntry['type'],
      content: text,
      importance: normalizedType === 'decision' || normalizedType === 'taste' ? 0.8 : normalizedType === 'architecture' ? 0.75 : normalizedType === 'bug' ? 0.7 : 0.5,
      confidence: normalizedType === 'note' ? 0.4 : 0.7,
    });
  }

  // Untagged trailing text → note entries
  const remaining = context.slice(lastIndex).trim();
  if (remaining) {
    for (const line of remaining.split('\n').map(l => l.trim()).filter(Boolean)) {
      const key = buildKey('note', line);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        key,
        type: 'note',
        content: line,
        importance: 0.5,
        confidence: 0.4,
      });
    }
  }

  return entries;
}

/**
 * Sync Dream-consolidated memory files into MemoryDB.
 *
 * Called after Dream completes — reads markdown files from the memory
 * directory that Dream wrote/updated and upserts tagged lines into
 * MemoryDB. This bridges Dream's file-based output with the SQLite
 * memory store.
 *
 * @param memoryRoot Path to Dream's memory directory (e.g. `getAutoMemPath()`)
 * @returns Number of memories synced into MemoryDB
 */
export async function syncDreamToMemoryDB(memoryRoot: string): Promise<number> {
  if (!MemoryDB.isInitialized()) return 0;
  const db = MemoryDB.getInstance();
  let syncedCount = 0;

  // Read all markdown files in the memory directory
  let files: string[];
  try {
    files = (await readdir(memoryRoot)).filter(f => f.endsWith('.md'));
  } catch {
    return 0;
  }

  for (const file of files) {
    const filePath = join(memoryRoot, file);
    try {
      const content = await readFile(filePath, 'utf8');
      // Parse tagged lines: [type] description
      const TAG_LINE = /^\s*[-*]\s*\[(\w+)\]\s+(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = TAG_LINE.exec(content)) !== null) {
        const type = match[1]!.toLowerCase();
        const text = match[2]!.trim();
        if (!text) continue;

        const validTypes = ['decision', 'architecture', 'taste', 'bug', 'task_progress', 'command', 'note'];
        const normalizedType = validTypes.includes(type) ? type : 'note';

        db.upsertMemory({
          key: `dream.${slugify(text).slice(0, 60)}`,
          projectPath: getCwd(),
          type: normalizedType,
          content: text,
          importance: normalizedType === 'decision' || normalizedType === 'taste' ? 0.8 : normalizedType === 'architecture' ? 0.75 : normalizedType === 'bug' ? 0.7 : 0.5,
          confidence: 0.7,
        });
        syncedCount++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  return syncedCount;
}
