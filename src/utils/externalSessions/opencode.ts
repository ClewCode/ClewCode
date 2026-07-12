/**
 * OpenCode session adapter.
 *
 * Storage (~/.local/share/opencode/storage):
 *   session/<projectId>/<sessionId>.json  — { id, directory, title, time }
 *   message/<sessionId>/<msgId>.json       — { role, time.created }
 *   part/<msgId>/<partId>.json             — { type:"text", text } (+ tool parts)
 *
 * Message text is split across part files, so loading a message means reading
 * its message record for role/time and joining its text parts.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ExternalSessionAdapter, ExternalSessionMeta, NormalizedMessage } from './types.js';

function storageDir(): string {
  return join(homedir(), '.local', 'share', 'opencode', 'storage');
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

async function listSessions(opts?: { cwd?: string }): Promise<ExternalSessionMeta[]> {
  const sessionRoot = join(storageDir(), 'session');
  const results: ExternalSessionMeta[] = [];
  let projectDirs;
  try {
    projectDirs = (await readdir(sessionRoot, { withFileTypes: true })).filter(d => d.isDirectory());
  } catch {
    return [];
  }
  for (const proj of projectDirs) {
    const dir = join(sessionRoot, proj.name);
    let files: string[];
    try {
      files = (await readdir(dir)).filter(f => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      const meta = await readJson(join(dir, file));
      if (!meta || typeof meta.id !== 'string') continue;
      const cwd = typeof meta.directory === 'string' ? meta.directory : undefined;
      if (opts?.cwd && cwd && cwd.toLowerCase() !== opts.cwd.toLowerCase()) continue;
      const time = meta.time as Record<string, unknown> | undefined;
      const modified = typeof time?.updated === 'number' ? time.updated : (time?.created as number) ?? Date.now();
      const msgDir = join(storageDir(), 'message', meta.id);
      let messageCount = 0;
      try {
        messageCount = (await readdir(msgDir)).filter(f => f.endsWith('.json')).length;
      } catch {
        // no messages dir — skip empty sessions
      }
      if (messageCount === 0) continue;
      results.push({
        tool: 'opencode',
        externalId: meta.id,
        title: (typeof meta.title === 'string' && meta.title) || '(untitled)',
        cwd,
        modified,
        messageCount,
        sourcePath: msgDir,
      });
    }
  }
  return results;
}

async function textForMessage(msgId: string): Promise<string> {
  const partDir = join(storageDir(), 'part', msgId);
  let partFiles: string[];
  try {
    partFiles = (await readdir(partDir)).filter(f => f.endsWith('.json'));
  } catch {
    return '';
  }
  const parts: string[] = [];
  for (const pf of partFiles.sort()) {
    const part = await readJson(join(partDir, pf));
    if (!part) continue;
    if (part.type === 'text' && typeof part.text === 'string') parts.push(part.text);
    else if (part.type === 'tool' && typeof part.tool === 'string') parts.push(`[tool: ${part.tool}]`);
  }
  return parts.join('\n').trim();
}

async function loadMessages(meta: ExternalSessionMeta): Promise<NormalizedMessage[]> {
  // meta.sourcePath is the message/<sessionId> directory.
  let files: string[];
  try {
    files = (await readdir(meta.sourcePath)).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
  const records: { role: NormalizedMessage['role']; created: number; msgId: string }[] = [];
  for (const file of files) {
    const rec = await readJson(join(meta.sourcePath, file));
    if (!rec || typeof rec.id !== 'string') continue;
    const role = rec.role === 'assistant' ? 'assistant' : rec.role === 'user' ? 'user' : null;
    if (!role) continue;
    const time = rec.time as Record<string, unknown> | undefined;
    records.push({ role, created: (time?.created as number) ?? 0, msgId: rec.id });
  }
  records.sort((a, b) => a.created - b.created);
  const messages: NormalizedMessage[] = [];
  for (const rec of records) {
    const text = await textForMessage(rec.msgId);
    if (!text) continue;
    messages.push({ role: rec.role, text, timestamp: rec.created || undefined });
  }
  return messages;
}

export const opencodeAdapter: ExternalSessionAdapter = {
  tool: 'opencode',
  isAvailable: () => existsSync(join(storageDir(), 'session')),
  listSessions,
  loadMessages,
};
