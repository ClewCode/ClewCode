/**
 * Claude Code session adapter.
 *
 * Storage: ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
 * Format: JSONL, one entry per line. Message entries carry `type` ("user" /
 * "assistant") and a `message` object in Anthropic shape. clew is a Claude Code
 * fork, so this is very close to clew's own transcript format.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExternalSessionAdapter, ExternalSessionMeta, NormalizedMessage } from './types.js';

function baseDir(): string {
  return join(homedir(), '.claude', 'projects');
}

/** Pull plain text out of an Anthropic-style content field (string or blocks). */
export function textFromAnthropicContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    else if (b.type === 'thinking' && typeof b.thinking === 'string') parts.push(b.thinking);
    else if (b.type === 'tool_use' && typeof b.name === 'string') parts.push(`[tool: ${b.name}]`);
    else if (b.type === 'tool_result') {
      const inner = textFromAnthropicContent(b.content);
      if (inner) parts.push(inner);
    }
  }
  return parts.join('\n').trim();
}

function parseJsonlEntries(content: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines rather than failing the whole session.
    }
  }
  return out;
}

async function listSessions(opts?: { cwd?: string }): Promise<ExternalSessionMeta[]> {
  const root = baseDir();
  let projectDirs: string[];
  try {
    projectDirs = (await readdir(root, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => join(root, d.name));
  } catch {
    return [];
  }

  const results: ExternalSessionMeta[] = [];
  for (const dir of projectDirs) {
    let files: string[];
    try {
      files = (await readdir(dir)).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(dir, file);
      try {
        const [content, stats] = await Promise.all([readFile(path, 'utf-8'), stat(path)]);
        const entries = parseJsonlEntries(content);
        let title = '';
        let cwd: string | undefined;
        let messageCount = 0;
        for (const e of entries) {
          if (e.type === 'user' || e.type === 'assistant') messageCount++;
          if (!cwd && typeof e.cwd === 'string') cwd = e.cwd;
          if (!title && e.type === 'user') {
            const msg = e.message as Record<string, unknown> | undefined;
            const t = textFromAnthropicContent(msg?.content);
            if (t) title = t.replace(/\s+/g, ' ').slice(0, 80);
          }
        }
        if (messageCount === 0) continue;
        if (opts?.cwd && cwd && cwd.toLowerCase() !== opts.cwd.toLowerCase()) continue;
        results.push({
          tool: 'claude',
          externalId: file.replace(/\.jsonl$/, ''),
          title: title || '(untitled)',
          cwd,
          modified: stats.mtimeMs,
          messageCount,
          sourcePath: path,
        });
      } catch {
        // Skip unreadable files.
      }
    }
  }
  return results;
}

async function loadMessages(meta: ExternalSessionMeta): Promise<NormalizedMessage[]> {
  const content = await readFile(meta.sourcePath, 'utf-8');
  const entries = parseJsonlEntries(content);
  const messages: NormalizedMessage[] = [];
  for (const e of entries) {
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    const msg = e.message as Record<string, unknown> | undefined;
    if (!msg) continue;
    const text = textFromAnthropicContent(msg.content);
    if (!text) continue;
    const ts = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : undefined;
    messages.push({ role: e.type, text, timestamp: Number.isNaN(ts) ? undefined : ts });
  }
  return messages;
}

export const claudeAdapter: ExternalSessionAdapter = {
  tool: 'claude',
  isAvailable: () => existsSync(baseDir()),
  listSessions,
  loadMessages,
};
