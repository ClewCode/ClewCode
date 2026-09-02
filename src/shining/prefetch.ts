/**
 * Context Compiler integration — preload suggestedContext files
 * Cheap: only read files, no LLM
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCwd } from '../utils/cwd.js';
import { list } from './premonition-store.js';
import { policyFor } from './policy.js';

export async function prefetchShiningContext(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const premonitions = list().filter(p => {
    const action = policyFor(p.confidence);
    return action === 'prefetch' || action === 'suggest' || action === 'prepare';
  });
  const files = new Set<string>();
  for (const p of premonitions) {
    for (const f of p.suggestedContext || []) files.add(f);
  }
  const cwd = (() => {
    try {
      return getCwd();
    } catch {
      return process.cwd();
    }
  })();
  for (const rel of files) {
    try {
      const content = await readFile(join(cwd, rel), 'utf8');
      result.set(rel, content.slice(0, 4000));
    } catch {}
  }
  return result;
}

export function formatPrefetched(prefetched: Map<string, string>): string | null {
  if (prefetched.size === 0) return null;
  const lines: string[] = ['<shining_prefetch>'];
  for (const [path, content] of prefetched) {
    lines.push(`--- ${path} ---`);
    lines.push(content.slice(0, 1500));
  }
  lines.push('</shining_prefetch>');
  return lines.join('\n');
}
