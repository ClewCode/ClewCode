/**
 * Gemini CLI session adapter.
 *
 * Storage: ~/.gemini/tmp/<project-basename>/chats/session-<ts>-<tag>.jsonl
 * Format: JSONL as a mutation log. The first line is session metadata; later
 * lines are store ops — `{"$set":{"messages":[...]}}` (replace) and
 * `{"$push":{"messages": <msg|msg[]>}}` (append). A message is
 * `{ id, timestamp, type:"user"|"gemini"|"model", content:[{ text }] }`.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { ExternalSessionAdapter, ExternalSessionMeta, NormalizedMessage } from './types.js';

function tmpDir(): string {
  return join(homedir(), '.gemini', 'tmp');
}

function textFromGeminiContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (typeof b.text === 'string') parts.push(b.text);
    else if (b.functionCall && typeof (b.functionCall as any).name === 'string') {
      parts.push(`[tool: ${(b.functionCall as any).name}]`);
    }
  }
  return parts.join('\n').trim();
}

function roleForType(type: unknown): NormalizedMessage['role'] | null {
  if (type === 'user') return 'user';
  if (type === 'gemini' || type === 'model' || type === 'assistant') return 'assistant';
  return null;
}

/** Replay the mutation log into the final messages array. */
function reconstructMessages(content: string): Record<string, unknown>[] {
  let messages: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let op: Record<string, unknown>;
    try {
      op = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const set = op.$set as Record<string, unknown> | undefined;
    const push = op.$push as Record<string, unknown> | undefined;
    if (set && Array.isArray(set.messages)) {
      messages = set.messages as Record<string, unknown>[];
    } else if (push && push.messages !== undefined) {
      const m = push.messages;
      if (Array.isArray(m)) messages.push(...(m as Record<string, unknown>[]));
      else messages.push(m as Record<string, unknown>);
    }
  }
  return messages;
}

/** Skip the synthetic <session_context> priming turn Gemini injects first. */
function isSessionContextPrimer(text: string): boolean {
  return text.startsWith('<session_context>');
}

async function listSessions(opts?: { cwd?: string }): Promise<ExternalSessionMeta[]> {
  const root = tmpDir();
  let projects;
  try {
    projects = (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory());
  } catch {
    return [];
  }
  const cwdBase = opts?.cwd ? basename(opts.cwd).toLowerCase() : undefined;
  const results: ExternalSessionMeta[] = [];
  for (const proj of projects) {
    if (cwdBase && proj.name.toLowerCase() !== cwdBase) continue;
    const chatsDir = join(root, proj.name, 'chats');
    let files: string[];
    try {
      files = (await readdir(chatsDir)).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(chatsDir, file);
      try {
        const [content, stats] = await Promise.all([readFile(path, 'utf-8'), stat(path)]);
        const msgs = reconstructMessages(content);
        let title = '';
        let messageCount = 0;
        for (const m of msgs) {
          const role = roleForType(m.type);
          if (!role) continue;
          const text = textFromGeminiContent(m.content);
          if (!text || isSessionContextPrimer(text)) continue;
          messageCount++;
          if (!title && role === 'user') title = text.replace(/\s+/g, ' ').slice(0, 80);
        }
        if (messageCount === 0) continue;
        results.push({
          tool: 'gemini',
          externalId: file.replace(/\.jsonl$/, ''),
          title: title || '(untitled)',
          cwd: proj.name,
          modified: stats.mtimeMs,
          messageCount,
          sourcePath: path,
        });
      } catch {
        // skip
      }
    }
  }
  return results;
}

async function loadMessages(meta: ExternalSessionMeta): Promise<NormalizedMessage[]> {
  const content = await readFile(meta.sourcePath, 'utf-8');
  const msgs = reconstructMessages(content);
  const out: NormalizedMessage[] = [];
  for (const m of msgs) {
    const role = roleForType(m.type);
    if (!role) continue;
    const text = textFromGeminiContent(m.content);
    if (!text || isSessionContextPrimer(text)) continue;
    const ts = typeof m.timestamp === 'string' ? Date.parse(m.timestamp) : undefined;
    out.push({ role, text, timestamp: ts && !Number.isNaN(ts) ? ts : undefined });
  }
  return out;
}

export const geminiAdapter: ExternalSessionAdapter = {
  tool: 'gemini',
  isAvailable: () => existsSync(tmpDir()),
  listSessions,
  loadMessages,
};
