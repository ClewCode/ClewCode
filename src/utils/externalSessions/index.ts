/**
 * Cross-tool session resume — registry + import.
 *
 * Aggregates the per-tool adapters, and materializes an external session as a
 * clew transcript (JSONL) so the existing /resume flow can continue it. The
 * written file lives in the current repo's project dir, so it shows up in the
 * /resume picker like any native clew session.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getOriginalCwd } from '../../bootstrap/state.js';
import { getTranscriptPathForSession } from '../sessionStorage.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { geminiAdapter } from './gemini.js';
import { opencodeAdapter } from './opencode.js';
import type { ExternalSessionAdapter, ExternalSessionMeta, ExternalTool, NormalizedMessage } from './types.js';

export type { ExternalSessionMeta, ExternalTool, NormalizedMessage } from './types.js';

const ADAPTERS: ExternalSessionAdapter[] = [claudeAdapter, codexAdapter, opencodeAdapter, geminiAdapter];

export const EXTERNAL_TOOL_LABELS: Record<ExternalTool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
};

export function getAvailableTools(): ExternalTool[] {
  return ADAPTERS.filter(a => a.isAvailable()).map(a => a.tool);
}

function adapterFor(tool: ExternalTool): ExternalSessionAdapter {
  const a = ADAPTERS.find(x => x.tool === tool);
  if (!a) throw new Error(`No adapter for tool: ${tool}`);
  return a;
}

/**
 * List sessions across all available tools, newest first. `scopeToCwd` limits
 * to sessions whose recorded working directory matches the current repo.
 */
export async function listAllExternalSessions(opts?: {
  tools?: ExternalTool[];
  scopeToCwd?: boolean;
}): Promise<ExternalSessionMeta[]> {
  const cwd = opts?.scopeToCwd ? getOriginalCwd() : undefined;
  const wanted = opts?.tools;
  const adapters = ADAPTERS.filter(a => a.isAvailable() && (!wanted || wanted.includes(a.tool)));
  const lists = await Promise.all(
    adapters.map(a => a.listSessions({ cwd }).catch(() => [] as ExternalSessionMeta[])),
  );
  return lists.flat().sort((a, b) => b.modified - a.modified);
}

/** Escape nothing special — JSON.stringify handles it; kept for symmetry. */
function toIso(ts?: number): string {
  return new Date(ts ?? Date.now()).toISOString();
}

/**
 * Convert normalized messages into clew transcript lines (Claude Code JSONL
 * shape: a parentUuid chain of user/assistant entries). Returns the JSONL text.
 */
export function buildClewTranscript(
  sessionId: string,
  cwd: string,
  messages: NormalizedMessage[],
  source: { tool: ExternalTool; title: string },
): string {
  const lines: string[] = [];
  lines.push(JSON.stringify({ type: 'mode', mode: 'normal', sessionId }));

  // A leading system note so the continued conversation records its origin.
  const header = `[Imported from ${EXTERNAL_TOOL_LABELS[source.tool]} — "${source.title}". The conversation below is prior context; continue from it.]`;
  let parentUuid: string | null = null;

  const emitUser = (text: string, ts?: number) => {
    const uuid = randomUUID();
    lines.push(
      JSON.stringify({
        parentUuid,
        isSidechain: false,
        promptId: randomUUID(),
        type: 'user',
        message: { role: 'user', content: text },
        uuid,
        timestamp: toIso(ts),
        userType: 'external',
        entrypoint: 'cli',
        cwd,
        sessionId,
        version: 'unknown',
        gitBranch: 'HEAD',
      }),
    );
    parentUuid = uuid;
  };

  const emitAssistant = (text: string, ts?: number) => {
    const uuid = randomUUID();
    lines.push(
      JSON.stringify({
        parentUuid,
        isSidechain: false,
        message: {
          id: `msg-${uuid}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text }],
        },
        uuid,
        timestamp: toIso(ts),
        type: 'assistant',
        cwd,
        sessionId,
        version: 'unknown',
        gitBranch: 'HEAD',
      }),
    );
    parentUuid = uuid;
  };

  emitUser(header, messages[0]?.timestamp);
  for (const m of messages) {
    if (m.role === 'user') emitUser(m.text, m.timestamp);
    else emitAssistant(m.text, m.timestamp);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Import an external session into clew: normalize its messages, write a clew
 * transcript into the current repo's project dir, and return the new session
 * id (resumable via `/resume <id>` or the picker).
 */
export async function importExternalSession(meta: ExternalSessionMeta): Promise<{ sessionId: string; messageCount: number }> {
  const adapter = adapterFor(meta.tool);
  const messages = await adapter.loadMessages(meta);
  if (messages.length === 0) {
    throw new Error('No resumable messages found in that session.');
  }
  const sessionId = randomUUID();
  const cwd = getOriginalCwd();
  const transcript = buildClewTranscript(sessionId, cwd, messages, { tool: meta.tool, title: meta.title });
  const path = getTranscriptPathForSession(sessionId, cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, transcript, 'utf-8');
  return { sessionId, messageCount: messages.length };
}
