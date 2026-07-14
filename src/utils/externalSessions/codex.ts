/**
 * Codex CLI session adapter.
 *
 * Storage: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
 * Format: JSONL. A `session_meta` line holds cwd + session_id; conversation
 * turns are `response_item` lines whose payload is `{ type:"message", role,
 * content:[{ type:"input_text"|"output_text"|"text", text }] }`.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExternalSessionAdapter, ExternalSessionMeta, NormalizedMessage } from './types.js';

function baseDir(): string {
  return join(homedir(), '.codex', 'sessions');
}

/** Recursively collect rollout-*.jsonl files under the sessions tree. */
async function findRolloutFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findRolloutFiles(full)));
    } else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

function textFromCodexContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (typeof b.text === 'string' && (b.type === 'input_text' || b.type === 'output_text' || b.type === 'text')) {
      parts.push(b.text);
    }
  }
  return parts.join('\n').trim();
}

function parseLines(content: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip
    }
  }
  return out;
}

/** Codex records developer/system prompts as messages too — skip those. */
function includeRole(role: unknown): role is 'user' | 'assistant' {
  return role === 'user' || role === 'assistant';
}

async function listSessions(opts?: { cwd?: string }): Promise<ExternalSessionMeta[]> {
  const files = await findRolloutFiles(baseDir());
  const results: ExternalSessionMeta[] = [];
  for (const path of files) {
    try {
      const [content, stats] = await Promise.all([readFile(path, 'utf-8'), stat(path)]);
      const entries = parseLines(content);
      let cwd: string | undefined;
      let externalId = '';
      let title = '';
      let messageCount = 0;
      for (const e of entries) {
        const payload = e.payload as Record<string, unknown> | undefined;
        if (e.type === 'session_meta' && payload) {
          if (typeof payload.cwd === 'string') cwd = payload.cwd;
          if (typeof payload.session_id === 'string') externalId = payload.session_id;
        } else if (e.type === 'response_item' && payload?.type === 'message' && includeRole(payload.role)) {
          messageCount++;
          if (!title && payload.role === 'user') {
            const t = textFromCodexContent(payload.content);
            if (t) title = t.replace(/\s+/g, ' ').slice(0, 80);
          }
        }
      }
      if (messageCount === 0) continue;
      if (opts?.cwd && cwd && cwd.toLowerCase() !== opts.cwd.toLowerCase()) continue;
      results.push({
        tool: 'codex',
        externalId:
          externalId ||
          path
            .split(/[\\/]/)
            .pop()!
            .replace(/\.jsonl$/, ''),
        title: title || '(untitled)',
        cwd,
        modified: stats.mtimeMs,
        messageCount,
        sourcePath: path,
      });
    } catch {
      // skip unreadable
    }
  }
  return results;
}

async function loadMessages(meta: ExternalSessionMeta): Promise<NormalizedMessage[]> {
  const content = await readFile(meta.sourcePath, 'utf-8');
  const entries = parseLines(content);
  const messages: NormalizedMessage[] = [];
  for (const e of entries) {
    if (e.type !== 'response_item') continue;
    const payload = e.payload as Record<string, unknown> | undefined;
    if (!payload || payload.type !== 'message' || !includeRole(payload.role)) continue;
    const text = textFromCodexContent(payload.content);
    if (!text) continue;
    const ts = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : undefined;
    messages.push({ role: payload.role, text, timestamp: Number.isNaN(ts) ? undefined : ts });
  }
  return messages;
}

export const codexAdapter: ExternalSessionAdapter = {
  tool: 'codex',
  isAvailable: () => existsSync(baseDir()),
  listSessions,
  loadMessages,
};
