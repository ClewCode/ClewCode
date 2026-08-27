/**
 * Durable per-agent message queue.
 *
 * One JSONL per recipient under `~/.clew/agent-tree/<rootSessionId>/queue/`.
 * enqueue → pending; drain marks lines delivered (atomic tmp+rename), so a
 * message written while the TUI was closed is still there on the next attach.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';

export type QueueMessageStatus = 'pending' | 'delivered';

export interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  ts: number;
  status: QueueMessageStatus;
}

function queueDir(rootSessionId: string): string {
  return join(queueHomeOverride ?? getClewConfigHomeDir(), 'agent-tree', rootSessionId, 'queue');
}

let queueHomeOverride: string | undefined;

/** Test hook — redirect queue files under a temp dir. */
export function setQueueHomeOverrideForTests(dir?: string): void {
  queueHomeOverride = dir;
}

function queueFile(agentId: string, rootSessionId?: string): string {
  return join(queueDir(rootSessionId ?? getSessionId()), `${agentId}.jsonl`);
}

function safeAgentId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function enqueue(
  toAgentId: string,
  from: string,
  text: string,
  opts?: { rootSessionId?: string },
): QueuedMessage {
  const msg: QueuedMessage = {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    from,
    to: toAgentId,
    text,
    ts: Date.now(),
    status: 'pending',
  };
  const path = queueFile(safeAgentId(toAgentId), opts?.rootSessionId);
  mkdirSync(dirname(path), { recursive: true });
  // O_APPEND + single-line write keeps concurrent producers from clobbering each other without a lockfile
  const fd = openSync(path, 'a');
  try {
    appendFileSync(fd, `${JSON.stringify(msg)}\n`, 'utf8');
  } finally {
    closeSync(fd);
  }
  return msg;
}

function readMessages(path: string): QueuedMessage[] {
  if (!existsSync(path)) return [];
  const out: QueuedMessage[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as QueuedMessage);
    } catch {
      // torn final line — skip
    }
  }
  return out;
}

/** Fetch and mark delivered. Returns messages in arrival order. */
export function drainInbox(toAgentId: string, opts?: { rootSessionId?: string }): QueuedMessage[] {
  const path = queueFile(safeAgentId(toAgentId), opts?.rootSessionId);
  const all = readMessages(path);
  const pending = all.filter(m => m.status === 'pending');
  if (pending.length === 0) return [];
  // rewrite with the delivered set persisted before returning — never lose an ack
  const tmp = `${path}.tmp`;
  writeFileSync(
    tmp,
    all
      .map(m => (m.status === 'pending' ? { ...m, status: 'delivered' as const } : m))
      .map(l => JSON.stringify(l))
      .join('\n') + '\n',
    'utf8',
  );
  renameSync(tmp, path);
  return pending;
}

export function inboxDepth(toAgentId: string, opts?: { rootSessionId?: string }): number {
  const path = queueFile(safeAgentId(toAgentId), opts?.rootSessionId);
  return readMessages(path).filter(m => m.status === 'pending').length;
}
