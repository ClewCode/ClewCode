/**
 * BudgetInjector — importance-ranked memory injection into system prompt.
 *
 * Queries the SQLite MemoryDB for memories, ranks them by
 * importance × confidence × recency, and fits as many as possible
 * into the given token budget.
 */

import { getCwd } from '../utils/cwd.js';
import { readMemoryFile } from './hierarchy.js';
import { MemoryDB } from './database.js';
import type { MemoryRecord } from './database.js';

const CHARS_PER_TOKEN = 4;
const OVERHEAD_TOKENS = 20; // formatting overhead per memory

/**
 * Get a section header for the memory injection.
 */
function sectionHeader(label: string, count: number): string {
  return `\n[Memory: ${label} — ${count} item${count !== 1 ? 's' : ''}]`;
}

/**
 * Format a single memory record for injection.
 */
function formatMemory(m: MemoryRecord): string {
  const confidence = m.confidence >= 0.7 ? '' : m.confidence >= 0.4 ? ' (maybe)' : ' (guess)';
  return `[${m.type}]${confidence} ${m.content}`;
}

/**
 * Estimate token count for a string.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type InjectedMemoryDetail = {
  key: string;
  type: string;
  importance: number;
  score: number;
  tokens: number;
};

export type SkippedMemoryDetail = {
  key: string;
  reason: string;
};

export type InjectResult = {
  text: string;
  usedTokens: number;
  totalBudget: number;
  injected: InjectedMemoryDetail[];
  skipped: SkippedMemoryDetail[];
};

/**
 * Budgeted injection — load memories from SQLite DB ranked by importance,
 * and fit them into the available token budget.
 *
 * @param maxTokens Maximum tokens to use for memory injection
 * @param includeFileHierarchy Also load MEMORY.md, DECISIONS.md, TASTE.md
 * @returns Formatted memory string to inject, or empty string if no memories
 */
export async function budgetedInject(maxTokens = 2000, includeFileHierarchy = true): Promise<string> {
  const result = await budgetedInjectDetailed(maxTokens, includeFileHierarchy);
  return result.text;
}

/**
 * Budgeted injection with full detail tracking.
 */
export async function budgetedInjectDetailed(
  maxTokens = 2000,
  includeFileHierarchy = true,
): Promise<InjectResult> {
  if (!MemoryDB.isInitialized()) {
    return { text: '', usedTokens: 0, totalBudget: maxTokens, injected: [], skipped: [] };
  }

  const db = MemoryDB.getInstance();
  const projectPath = getCwd();
  const parts: string[] = [];
  let usedTokens = 0;
  const injected: InjectedMemoryDetail[] = [];
  const skipped: SkippedMemoryDetail[] = [];
  const allCandidates: Array<{ key: string; type: string; importance: number; score: number }> = [];

  // 1. File hierarchy (always included, high priority)
  if (includeFileHierarchy) {
    for (const filename of ['MEMORY.md', 'DECISIONS.md', 'TASTE.md'] as const) {
      const content = await readMemoryFile(filename);
      if (!content) continue;
      const label = filename.replace('.md', '');
      const estimated = estimateTokens(content);
      if (usedTokens + estimated > maxTokens) {
        const available = (maxTokens - usedTokens) * CHARS_PER_TOKEN;
        const truncated = content.length > available
          ? content.slice(0, available) + '\n... (truncated)'
          : content;
        parts.push(`\n[${label}]\n${truncated}`);
        usedTokens = maxTokens;
        break;
      }
      parts.push(`\n[${label}]\n${content}`);
      usedTokens += estimated;
    }
  }

  // 2. Budgeted SQLite memories
  if (usedTokens < maxTokens) {
    const remaining = maxTokens - usedTokens;
    const memories = db.getBudgetedMemories({
      projectPath,
      maxTokens: remaining,
      minImportance: 0.3,
    });

    if (memories.length > 0) {
      // Score each candidate
      for (const m of memories) {
        const recency = m.lastAccessedAt
          ? Math.max(0, 1 - (Date.now() - new Date(m.lastAccessedAt).getTime()) / (90 * 86400000))
          : 0.5;
        const score = m.importance * 0.5 + m.confidence * 0.3 + recency * 0.2;
        allCandidates.push({ key: findKeyForId(db, m.id) ?? m.id, type: m.type, importance: m.importance, score });
      }

      // Sort by score descending for budget fill
      allCandidates.sort((a, b) => b.score - a.score);

      const byType = new Map<string, MemoryRecord[]>();
      for (const m of memories) {
        const list = byType.get(m.type) ?? [];
        list.push(m);
        byType.set(m.type, list);
      }

      for (const [type, ms] of byType) {
        const header = sectionHeader(type, ms.length);
        const headerTokens = estimateTokens(header);
        if (usedTokens + headerTokens > maxTokens) {
          for (const m of ms) {
            skipped.push({ key: findKeyForId(db, m.id) ?? m.id, reason: `budget exhausted at header for ${type}` });
          }
          break;
        }
        parts.push(header);
        usedTokens += headerTokens;

        for (const m of ms) {
          const formatted = `\n- ${formatMemory(m)}`;
          const estimated = estimateTokens(formatted) + OVERHEAD_TOKENS;
          if (usedTokens + estimated > maxTokens) {
            skipped.push({ key: findKeyForId(db, m.id) ?? m.id, reason: 'budget exhausted' });
            break;
          }
          parts.push(formatted);
          usedTokens += estimated;
          const cand = allCandidates.find(c => c.key === (findKeyForId(db, m.id) ?? m.id));
          injected.push({
            key: findKeyForId(db, m.id) ?? m.id,
            type: m.type,
            importance: m.importance,
            score: cand?.score ?? m.importance * 0.5,
            tokens: estimated,
          });
        }
      }
    } else {
      // All candidates below minImportance
      const allMemories = db.queryMemories({ projectPath });
      for (const m of allMemories) {
        skipped.push({ key: findKeyForId(db, m.id) ?? m.id, reason: `importance ${m.importance.toFixed(2)} < 0.3 threshold` });
      }
    }
  }

  return {
    text: parts.join('\n'),
    usedTokens,
    totalBudget: maxTokens,
    injected,
    skipped,
  };
}

function findKeyForId(db: MemoryDB, id: string): string | null {
  try {
    const row = (db as any).db.prepare('SELECT key FROM memory_keys WHERE memory_id = ?').get(id) as { key: string } | null;
    return row?.key ?? null;
  } catch {
    return null;
  }
}

/**
 * Calculate recommended token budget for memory injection
 * based on model context window.
 */
export function getRecommendedMemoryBudget(modelContextWindow: number): number {
  // Use up to 5% of context window for memories, max 4000 tokens
  return Math.min(Math.round(modelContextWindow * 0.05), 4000);
}
