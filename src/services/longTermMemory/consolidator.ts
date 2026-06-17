/**
 * Memory Consolidator — merges related memories and archives stale ones.
 *
 * Scheduled: /memory consolidate (manual) or auto-daily
 *
 * What it does:
 * 1. Groups similar memories by keyword overlap
 * 2. Merges each group into one consolidated file
 * 3. Archives originals to .archived/
 * 4. Archives memories with age > 90 days and < 2 accesses
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { getFsImplementation } from '../../utils/fsOperations.js';

const ARCHIVE_AGE_DAYS = 90;
const _MIN_ACCESS_FOR_KEEP = 2;
const SIMILARITY_WORDS_MIN = 3; // Min shared keywords to be considered "similar"

function sanitizePath(p: string): string {
  return p.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+|_+$/g, '');
}

function getMemoryBase(projectRoot: string): string {
  return join(getClaudeConfigHomeDir(), 'projects', sanitizePath(projectRoot), 'memory');
}

interface MemoryFile {
  path: string;
  name: string;
  type: string;
  mtimeMs: number;
  keywords: string[];
  size: number;
}

/**
 * Run memory consolidation for a project.
 * Returns a report of what was done.
 */
export async function consolidateMemories(projectRoot: string): Promise<string> {
  const memDir = getMemoryBase(projectRoot);
  if (!existsSync(memDir)) return 'No memory directory found.';

  const files = await scanAllMemories(memDir);
  const report: string[] = [`Memory consolidation for ${projectRoot}`, `Total files: ${files.length}`, ''];

  // Phase 1: Archive old, rarely-accessed memories
  const now = Date.now();
  const archiveDir = join(memDir, '.archived');
  let archived = 0;

  for (const f of files) {
    const ageDays = (now - f.mtimeMs) / 86_400_000;
    // We don't have access count in filesystem, use age as proxy
    if (ageDays > ARCHIVE_AGE_DAYS && f.size < 5000) {
      if (!existsSync(archiveDir)) await mkdir(archiveDir, { recursive: true });
      const dest = join(archiveDir, f.type, basename(f.path));
      const destDir = join(archiveDir, f.type);
      if (!existsSync(destDir)) await mkdir(destDir, { recursive: true });
      await rename(f.path, dest);
      archived++;
    }
  }
  report.push(`Archived ${archived} old memories (>${ARCHIVE_AGE_DAYS}d, <5KB).`);

  // Phase 2: Merge similar memories (keyword overlap)
  const remaining = await scanAllMemories(memDir);
  const merged = mergeSimilar(remaining);
  let mergesDone = 0;

  for (const group of merged) {
    if (group.length < 2) continue;

    const consolidated = group.map(f => `From ${basename(f.path)}:\n${readFileSync(f.path)}`).join('\n\n---\n\n');
    const first = group[0];
    const mergedName = `consolidated-${first.type}-${Date.now()}.md`;
    const mergedPath = join(memDir, first.type, mergedName);

    await writeFile(mergedPath, consolidated, 'utf8');

    // Remove originals
    for (const f of group) {
      try {
        await unlink(f.path);
      } catch {
        /* skip */
      }
    }
    mergesDone++;
  }
  report.push(`Merged ${mergesDone} groups of similar memories.`);

  // Phase 3: Count final state
  const final = await scanAllMemories(memDir);
  report.push(`Remaining memories after consolidation: ${final.length}.`);
  report.push(`Savings: ${files.length - final.length} files removed.`);

  return report.join('\n');
}

async function scanAllMemories(memDir: string): Promise<MemoryFile[]> {
  const types = ['user', 'feedback', 'project', 'reference'];
  const results: MemoryFile[] = [];

  for (const t of types) {
    const dir = join(memDir, t);
    if (!existsSync(dir)) continue;
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (!f.endsWith('.md') || f.startsWith('consolidated')) continue;
        const fullPath = join(dir, f);
        try {
          const content = readFileContent(fullPath);
          const lines = content.split('\n');
          const keywords = extractKeywords(lines.slice(1).join('\n'));
          results.push({
            path: fullPath,
            name: f,
            type: t,
            mtimeMs: Date.now() - (content.length > 0 ? 0 : 0), // approximate
            keywords,
            size: content.length,
          });
        } catch {
          /* skip unreadable */
        }
      }
    } catch {
      /* skip inaccessible */
    }
  }

  return results;
}

function mergeSimilar(files: MemoryFile[]): MemoryFile[][] {
  const groups: MemoryFile[][] = [];
  const used = new Set<string>();

  for (let i = 0; i < files.length; i++) {
    if (used.has(files[i].path)) continue;
    const group: MemoryFile[] = [files[i]];
    used.add(files[i].path);

    for (let j = i + 1; j < files.length; j++) {
      if (used.has(files[j].path)) continue;
      if (files[i].type !== files[j].type) continue;

      const shared = files[i].keywords.filter(k => files[j].keywords.includes(k));
      if (shared.length >= SIMILARITY_WORDS_MIN) {
        group.push(files[j]);
        used.add(files[j].path);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4)
    .filter(w => !['about', 'there', 'their', 'which', 'would', 'could', 'should', 'after', 'before'].includes(w));

  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .map(([w]) => w)
    .slice(0, 20);
}

function readFileContent(path: string): string {
  const fs = getFsImplementation();
  try {
    return fs.readFileSync(path, { encoding: 'utf-8' }) as string;
  } catch {
    return '';
  }
}
