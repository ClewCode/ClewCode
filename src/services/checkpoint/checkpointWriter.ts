import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getCwd } from '../../utils/cwd.js';
import { getClewConfigHomeDir } from '../../utils/envUtils.js';
import { pathExists } from '../../utils/file.js';

/**
 * Structured checkpoint system for long-horizon tasks.
 *
 * Captures task state at three progress milestones (20%, 45%, 70%)
 * to enable session rebuild and context preservation across compactions.
 *
 * Persistence: ~/.clew/projects/<slug>/sessions/<sessionId>/checkpoints/
 */

export interface TaskCheckpoint {
  id: string;
  timestamp: number;
  progressPercent: number;
  goalText: string;
  turnCount: number;
  elapsedMs: number;
  filesModified: string[];
  commandsRun: string[];
  decisions: string[];
  currentBlockers: string[];
  nextSteps: string[];
  summary: string;
  cycle: number; // rebuild cycle (0 = first window, 1+ = rebuilt windows)
  notes: string; // accumulated notes from scratchpad since last checkpoint
}

const CHECKPOINT_THRESHOLDS = [20, 45, 70];

function getCheckpointsDir(): string {
  const sessionId = getSessionId();
  const cwd = getCwd();
  const slug = Buffer.from(cwd).toString('base64url').slice(0, 32);
  return join(getClewConfigHomeDir(), 'projects', slug, 'sessions', sessionId, 'checkpoints');
}

function getCheckpointFilePath(id: string): string {
  return join(getCheckpointsDir(), `${id}.json`);
}

function getCheckpointIndexPath(): string {
  return join(getCheckpointsDir(), 'index.json');
}

/** Determine which threshold (if any) was just crossed */
export function getNextCheckpointThreshold(turnCount: number, maxTurns: number | undefined): number | null {
  if (!maxTurns || maxTurns <= 0) return null;
  const progressPercent = (turnCount / maxTurns) * 100;
  for (const threshold of CHECKPOINT_THRESHOLDS) {
    if (progressPercent >= threshold) {
      // Check if this threshold was already written
      return threshold;
    }
  }
  return null;
}

/** Check if a specific threshold has already been written */
export async function hasCheckpoint(progressPercent: number): Promise<boolean> {
  const checkpoints = await loadCheckpoints();
  return checkpoints.some(c => c.progressPercent === progressPercent);
}

/** Write a checkpoint to disk */
export async function writeCheckpoint(checkpoint: TaskCheckpoint): Promise<void> {
  const dir = getCheckpointsDir();
  await mkdir(dir, { recursive: true });

  // Write checkpoint file
  await writeFile(getCheckpointFilePath(checkpoint.id), JSON.stringify(checkpoint, null, 2), 'utf-8');

  // Update index
  const index = await loadCheckpointIndex();
  const existing = index.findIndex(c => c.id === checkpoint.id);
  if (existing >= 0) {
    index[existing] = {
      id: checkpoint.id,
      progressPercent: checkpoint.progressPercent,
      timestamp: checkpoint.timestamp,
    };
  } else {
    index.push({ id: checkpoint.id, progressPercent: checkpoint.progressPercent, timestamp: checkpoint.timestamp });
  }
  index.sort((a, b) => a.progressPercent - b.progressPercent);
  await writeFile(getCheckpointIndexPath(), JSON.stringify(index), 'utf-8');
}

/** Load all checkpoints for the current session */
export async function loadCheckpoints(): Promise<TaskCheckpoint[]> {
  const dir = getCheckpointsDir();
  if (!(await pathExists(dir))) return [];

  const index = await loadCheckpointIndex();
  const checkpoints: TaskCheckpoint[] = [];

  for (const entry of index) {
    try {
      const raw = await readFile(getCheckpointFilePath(entry.id), 'utf-8');
      checkpoints.push(JSON.parse(raw));
    } catch {
      // Skip corrupted checkpoint files
    }
  }

  return checkpoints;
}

/** Get the latest checkpoint (highest progressPercent) */
export async function getLatestCheckpoint(): Promise<TaskCheckpoint | null> {
  const checkpoints = await loadCheckpoints();
  if (checkpoints.length === 0) return null;
  return checkpoints[checkpoints.length - 1]!;
}

/** Get checkpoint index (lightweight listing) */
async function loadCheckpointIndex(): Promise<Array<{ id: string; progressPercent: number; timestamp: number }>> {
  const indexPath = getCheckpointIndexPath();
  if (!(await pathExists(indexPath))) return [];
  try {
    const raw = await readFile(indexPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ── Notes scratchpad ──
// Main agent's only write channel. Writer reads notes at checkpoint time,
// routes content into structured fields, then clears the file.
// This keeps extraction out of the main loop — the agent doesn't maintain its own memory.

const NOTES_FILENAME = 'notes.md';

function getNotesPath(): string {
  return join(getCheckpointsDir(), NOTES_FILENAME);
}

/** Append a note to the scratchpad. Fire-and-forget safe — never throws. */
export async function appendNote(note: string): Promise<void> {
  try {
    const dir = getCheckpointsDir();
    await mkdir(dir, { recursive: true });
    await appendFile(getNotesPath(), `- ${note}\n`, 'utf-8');
  } catch {
    // Silent — notes are advisory, never blocking
  }
}

/** Read all accumulated notes from the scratchpad. */
export async function readNotes(): Promise<string> {
  try {
    const p = getNotesPath();
    if (!(await pathExists(p))) return '';
    return await readFile(p, 'utf-8');
  } catch {
    return '';
  }
}

/** Clear the notes scratchpad after checkpoint processing. */
export async function clearNotes(): Promise<void> {
  try {
    const p = getNotesPath();
    if (await pathExists(p)) {
      await writeFile(p, '', 'utf-8');
    }
  } catch {
    // Silent
  }
}

/** Increment the rebuild cycle counter stored in checkpoint dir. */
export async function incrementCycle(): Promise<number> {
  try {
    const dir = getCheckpointsDir();
    await mkdir(dir, { recursive: true });
    const cyclePath = join(dir, 'cycle.txt');
    let cycle = 0;
    if (await pathExists(cyclePath)) {
      const raw = await readFile(cyclePath, 'utf-8');
      cycle = parseInt(raw.trim(), 10) || 0;
    }
    cycle++;
    await writeFile(cyclePath, String(cycle), 'utf-8');
    return cycle;
  } catch {
    return 1;
  }
}

// ── Compaction checkpoints ──
// Compaction is the moment context is about to be destroyed, so it's the
// natural point to snapshot session state — for every session, not just
// goal-mode runs with a turn budget.

type MessageLike = {
  type?: string;
  message?: { content?: unknown };
};

/** Extract decision statements, shell commands, and modified files from message tail. */
export function extractCheckpointSignals(
  messages: MessageLike[],
  tail = 40,
): { decisions: string[]; commandsRun: string[]; filesModified: string[] } {
  const decisions: string[] = [];
  const commandsRun: string[] = [];
  const filesModified: string[] = [];

  for (const msg of messages.slice(-tail)) {
    if (msg.type !== 'assistant' || !msg.message) continue;
    const content = msg.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const text = block.text as string;
        if (text.includes("I'll") || text.includes('Let me') || text.includes('plan')) {
          decisions.push(text.slice(0, 200));
        }
      }
      if (block?.type === 'tool_use') {
        const input = (block.input ?? {}) as Record<string, unknown>;
        if (block.name === 'Bash' && typeof input.command === 'string') {
          commandsRun.push(input.command.slice(0, 200));
        }
        if ((block.name === 'Write' || block.name === 'Edit') && typeof input.file_path === 'string') {
          filesModified.push(input.file_path);
        }
      }
    }
  }

  return {
    decisions: decisions.slice(-5),
    commandsRun: commandsRun.slice(-10),
    filesModified: [...new Set(filesModified)].slice(-20),
  };
}

export type CompactionCheckpointInfo = {
  cycle: number;
  filesModified: number;
  commandsRun: number;
  timestamp: number;
};

let lastCompactionCheckpoint: CompactionCheckpointInfo | null = null;

/** Info about the most recent compaction checkpoint (for UI display). */
export function getLastCompactionCheckpointInfo(): CompactionCheckpointInfo | null {
  return lastCompactionCheckpoint;
}

/**
 * Write a checkpoint at compaction time so post-compact context rebuild
 * (tryRebuildFromCheckpoint) has fresh session state even without an
 * active goal. Increments the rebuild cycle and consumes scratchpad notes.
 * Never throws — checkpointing must not block compaction.
 */
export async function writeCompactionCheckpoint(messages: MessageLike[], goalText?: string): Promise<void> {
  try {
    const signals = extractCheckpointSignals(messages);
    const notes = await readNotes();
    const cycle = await incrementCycle();
    const turnCount = messages.filter(m => m.type === 'user').length;

    await writeCheckpoint({
      id: `checkpoint-compact-${Date.now()}`,
      timestamp: Date.now(),
      // 100 ranks compaction snapshots above threshold checkpoints so
      // getLatestCheckpoint() prefers the freshest state.
      progressPercent: 100,
      goalText: goalText || 'Session checkpoint (written at compaction)',
      turnCount,
      elapsedMs: 0,
      filesModified: signals.filesModified,
      commandsRun: signals.commandsRun,
      decisions: signals.decisions,
      currentBlockers: [],
      nextSteps: [],
      summary: '',
      cycle,
      notes,
    });
    // Notes are baked into the checkpoint (and thus the rebuilt context) —
    // clear the scratchpad so the next window starts fresh.
    await clearNotes();

    lastCompactionCheckpoint = {
      cycle,
      filesModified: signals.filesModified.length,
      commandsRun: signals.commandsRun.length,
      timestamp: Date.now(),
    };
  } catch {
    // Silent — advisory, never blocks compaction
  }
}

/** Get the current cycle number (0 = first window). */
export async function getCurrentCycle(): Promise<number> {
  try {
    const cyclePath = join(getCheckpointsDir(), 'cycle.txt');
    if (!(await pathExists(cyclePath))) return 0;
    const raw = await readFile(cyclePath, 'utf-8');
    return parseInt(raw.trim(), 10) || 0;
  } catch {
    return 0;
  }
}
