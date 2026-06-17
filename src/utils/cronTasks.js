// Scheduled prompts, stored in <project>/.claude/scheduled_tasks.json.
//
// Tasks come in two flavors:
//   - One-shot (recurring: false/undefined) — fire once, then auto-delete.
//   - Recurring (recurring: true) — fire on schedule, reschedule from now,
//     persist until explicitly deleted via CronDelete or auto-expire after
//     a configurable limit (DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs).
//
// File format:
//   { "tasks": [{ id, cron, prompt, createdAt, recurring?, permanent? }] }
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { addSessionCronTask, getProjectRoot, getSessionCronTasks, removeSessionCronTasks } from '../bootstrap/state.js';
import { DOT_CLEW, SCHEDULED_TASKS_JSON } from './clewPaths.js';
import { computeNextCronRun, parseCronExpression } from './cron.js';
import { logForDebugging } from './debug.js';
import { isFsInaccessible } from './errors.js';
import { getFsImplementation } from './fsOperations.js';
import { safeParseJSON } from './json.js';
import { logError } from './log.js';
import { jsonStringify } from './slowOperations.js';

const CRON_FILE_REL = join(DOT_CLEW, SCHEDULED_TASKS_JSON);
/**
 * Path to the cron file. `dir` defaults to getProjectRoot() — pass it
 * explicitly from contexts that don't run through main.tsx (e.g. the Agent
 * SDK daemon, which has no bootstrap state).
 */
export function getCronFilePath(dir) {
  return join(dir ?? getProjectRoot(), CRON_FILE_REL);
}
/**
 * Read and parse .claude/scheduled_tasks.json. Returns an empty task list if the file
 * is missing, empty, or malformed. Tasks with invalid cron strings are
 * silently dropped (logged at debug level) so a single bad entry never
 * blocks the whole file.
 */
export async function readCronTasks(dir) {
  const fs = getFsImplementation();
  let raw;
  try {
    raw = await fs.readFile(getCronFilePath(dir), { encoding: 'utf-8' });
  } catch (e) {
    if (isFsInaccessible(e)) return [];
    logError(e);
    return [];
  }
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== 'object') return [];
  const file = parsed;
  if (!Array.isArray(file.tasks)) return [];
  const out = [];
  for (const t of file.tasks) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      typeof t.cron !== 'string' ||
      typeof t.prompt !== 'string' ||
      typeof t.createdAt !== 'number'
    ) {
      logForDebugging(`[ScheduledTasks] skipping malformed task: ${jsonStringify(t)}`);
      continue;
    }
    if (!parseCronExpression(t.cron)) {
      logForDebugging(`[ScheduledTasks] skipping task ${t.id} with invalid cron '${t.cron}'`);
      continue;
    }
    out.push({
      id: t.id,
      cron: t.cron,
      prompt: t.prompt,
      createdAt: t.createdAt,
      ...(typeof t.lastFiredAt === 'number' ? { lastFiredAt: t.lastFiredAt } : {}),
      ...(t.recurring ? { recurring: true } : {}),
      ...(t.permanent ? { permanent: true } : {}),
    });
  }
  return out;
}
/**
 * Sync check for whether the cron file has any valid tasks. Used by
 * cronScheduler.start() to decide whether to auto-enable. One file read.
 */
export function hasCronTasksSync(dir) {
  let raw;
  try {
    // eslint-disable-next-line custom-rules/no-sync-fs -- called once from cronScheduler.start()
    raw = readFileSync(getCronFilePath(dir), 'utf-8');
  } catch {
    return false;
  }
  const parsed = safeParseJSON(raw, false);
  if (!parsed || typeof parsed !== 'object') return false;
  const tasks = parsed.tasks;
  return Array.isArray(tasks) && tasks.length > 0;
}
/**
 * Overwrite .claude/scheduled_tasks.json with the given tasks. Creates .claude/ if
 * missing. Empty task list writes an empty file (rather than deleting) so
 * the file watcher sees a change event on last-task-removed.
 */
export async function writeCronTasks(tasks, dir) {
  const root = dir ?? getProjectRoot();
  await mkdir(join(root, DOT_CLEW), { recursive: true });
  // Strip the runtime-only `durable` flag — everything on disk is durable
  // by definition, and keeping the flag out means readCronTasks() naturally
  // yields durable: undefined without having to set it explicitly.
  const body = {
    tasks: tasks.map(({ durable: _durable, ...rest }) => rest),
  };
  await writeFile(getCronFilePath(root), `${jsonStringify(body, null, 2)}\n`, 'utf-8');
}
/**
 * Append a task. Returns the generated id. Caller is responsible for having
 * already validated the cron string (the tool does this via validateInput).
 *
 * When `durable` is false the task is held in process memory only
 * (bootstrap/state.ts) — it fires on schedule this session but is never
 * written to .claude/scheduled_tasks.json and dies with the process. The
 * scheduler merges session tasks into its tick loop directly, so no file
 * change event is needed.
 */
export async function addCronTask(cron, prompt, recurring, durable, agentId) {
  // Short ID — 8 hex chars is plenty for MAX_JOBS=50, avoids slice/prefix
  // juggling between the tool layer (shows short IDs) and disk.
  const id = randomUUID().slice(0, 8);
  const task = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...(recurring ? { recurring: true } : {}),
  };
  if (!durable) {
    addSessionCronTask({ ...task, ...(agentId ? { agentId } : {}) });
    return id;
  }
  const tasks = await readCronTasks();
  tasks.push(task);
  await writeCronTasks(tasks);
  return id;
}
/**
 * Remove tasks by id. No-op if none match (e.g. another session raced us).
 * Used for both fire-once cleanup and explicit CronDelete.
 *
 * When called with `dir` undefined (REPL path), also sweeps the in-memory
 * session store — the caller doesn't know which store an id lives in.
 * Daemon callers pass `dir` explicitly; they have no session, and the
 * `dir !== undefined` guard keeps this function from touching bootstrap
 * state on that path (tests enforce this).
 */
export async function removeCronTasks(ids, dir) {
  if (ids.length === 0) return;
  // Sweep session store first. If every id was accounted for there, we're
  // done — skip the file read entirely. removeSessionCronTasks is a no-op
  // (returns 0) on miss, so pre-existing durable-delete paths fall through
  // without allocating.
  if (dir === undefined && removeSessionCronTasks(ids) === ids.length) {
    return;
  }
  const idSet = new Set(ids);
  const tasks = await readCronTasks(dir);
  const remaining = tasks.filter(t => !idSet.has(t.id));
  if (remaining.length === tasks.length) return;
  await writeCronTasks(remaining, dir);
}
/**
 * Stamp `lastFiredAt` on the given recurring tasks and write back. Batched
 * so N fires in one scheduler tick = one read-modify-write, not N. Only
 * touches file-backed tasks — session tasks die with the process, no point
 * persisting their fire time. No-op if none of the ids match (task was
 * deleted between fire and write — e.g. user ran CronDelete mid-tick).
 *
 * Scheduler lock means at most one process calls this; chokidar picks up
 * the write and triggers a reload which re-seeds `nextFireAt` from the
 * just-written `lastFiredAt` — idempotent (same computation, same answer).
 */
export async function markCronTasksFired(ids, firedAt, dir) {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const tasks = await readCronTasks(dir);
  let changed = false;
  for (const t of tasks) {
    if (idSet.has(t.id)) {
      t.lastFiredAt = firedAt;
      changed = true;
    }
  }
  if (!changed) return;
  await writeCronTasks(tasks, dir);
}
/**
 * File-backed tasks + session-only tasks, merged. Session tasks get
 * `durable: false` so callers can distinguish them. File tasks are
 * returned as-is (durable undefined → truthy).
 *
 * Only merges when `dir` is undefined — daemon callers (explicit `dir`)
 * have no session store to merge with.
 */
export async function listAllCronTasks(dir) {
  const fileTasks = await readCronTasks(dir);
  if (dir !== undefined) return fileTasks;
  const sessionTasks = getSessionCronTasks().map(t => ({
    ...t,
    durable: false,
  }));
  return [...fileTasks, ...sessionTasks];
}
/**
 * Next fire time in epoch ms for a cron string, strictly after `fromMs`.
 * Returns null if invalid or no match in the next 366 days.
 */
export function nextCronRunMs(cron, fromMs) {
  const fields = parseCronExpression(cron);
  if (!fields) return null;
  const next = computeNextCronRun(fields, new Date(fromMs));
  return next ? next.getTime() : null;
}
export const DEFAULT_CRON_JITTER_CONFIG = {
  recurringFrac: 0.1,
  recurringCapMs: 15 * 60 * 1000,
  oneShotMaxMs: 90 * 1000,
  oneShotFloorMs: 0,
  oneShotMinuteMod: 30,
  recurringMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
};
/**
 * taskId is an 8-hex-char UUID slice (see {@link addCronTask}) → parse as
 * u32 → [0, 1). Stable across restarts, uniformly distributed across the
 * fleet. Non-hex ids (hand-edited JSON) fall back to 0 = no jitter.
 */
function jitterFrac(taskId) {
  const frac = parseInt(taskId.slice(0, 8), 16) / 0x1_0000_0000;
  return Number.isFinite(frac) ? frac : 0;
}
/**
 * Same as {@link nextCronRunMs}, plus a deterministic per-task delay to
 * avoid a thundering herd when many sessions schedule the same cron string
 * (e.g. `0 * * * *` → everyone hits inference at :00).
 *
 * The delay is proportional to the current gap between fires
 * ({@link CronJitterConfig.recurringFrac}, capped at
 * {@link CronJitterConfig.recurringCapMs}) so at defaults an hourly task
 * spreads across [:00, :06) but a per-minute task only spreads by a few
 * seconds.
 *
 * Only used for recurring tasks. One-shot tasks use
 * {@link oneShotJitteredNextCronRunMs} (backward jitter, minute-gated).
 */
export function jitteredNextCronRunMs(cron, fromMs, taskId, cfg = DEFAULT_CRON_JITTER_CONFIG) {
  const t1 = nextCronRunMs(cron, fromMs);
  if (t1 === null) return null;
  const t2 = nextCronRunMs(cron, t1);
  // No second match in the next year (e.g. pinned date) → nothing to
  // proportion against, and near-certainly not a herd risk. Fire on t1.
  if (t2 === null) return t1;
  const jitter = Math.min(jitterFrac(taskId) * cfg.recurringFrac * (t2 - t1), cfg.recurringCapMs);
  return t1 + jitter;
}
/**
 * Same as {@link nextCronRunMs}, minus a deterministic per-task lead time
 * when the fire time lands on a minute boundary matching
 * {@link CronJitterConfig.oneShotMinuteMod}.
 *
 * One-shot tasks are user-pinned ("remind me at 3pm") so delaying them
 * breaks the contract — but firing slightly early is invisible and spreads
 * the inference spike from everyone picking the same round wall-clock time.
 * At defaults (mod 30, max 90 s, floor 0) only :00 and :30 get jitter,
 * because humans round to the half-hour.
 *
 * During an incident, ops can push `tengu_kairos_cron_config` with e.g.
 * `{oneShotMinuteMod: 15, oneShotMaxMs: 300000, oneShotFloorMs: 30000}` to
 * spread :00/:15/:30/:45 fires across a [t-5min, t-30s] window — every task
 * gets at least 30 s of lead, so nobody lands on the exact mark.
 *
 * Checks the computed fire time rather than the cron string so
 * `0 15 * * *`, step expressions, and `0,30 9 * * *` all get jitter
 * when they land on a matching minute. Clamped to `fromMs` so a task created
 * inside its own jitter window doesn't fire before it was created.
 */
export function oneShotJitteredNextCronRunMs(cron, fromMs, taskId, cfg = DEFAULT_CRON_JITTER_CONFIG) {
  const t1 = nextCronRunMs(cron, fromMs);
  if (t1 === null) return null;
  // Cron resolution is 1 minute → computed times always have :00 seconds,
  // so a minute-field check is sufficient to identify the hot marks.
  // getMinutes() (local), not getUTCMinutes(): cron is evaluated in local
  // time, and "user picked a round time" means round in *their* TZ. In
  // half-hour-offset zones (India UTC+5:30) local :00 is UTC :30 — the
  // UTC check would jitter the wrong marks.
  if (new Date(t1).getMinutes() % cfg.oneShotMinuteMod !== 0) return t1;
  // floor + frac * (max - floor) → uniform over [floor, max). With floor=0
  // this reduces to the original frac * max. With floor>0, even a taskId
  // hashing to 0 gets `floor` ms of lead — nobody fires on the exact mark.
  const lead = cfg.oneShotFloorMs + jitterFrac(taskId) * (cfg.oneShotMaxMs - cfg.oneShotFloorMs);
  // t1 > fromMs is guaranteed by nextCronRunMs (strictly after), so the
  // max() only bites when the task was created inside its own lead window.
  return Math.max(t1 - lead, fromMs);
}
/**
 * A task is "missed" when its next scheduled run (computed from createdAt)
 * is in the past. Surfaced to the user at startup. Works for both one-shot
 * and recurring tasks — a recurring task whose window passed while Claude
 * was down is still "missed".
 */
export function findMissedTasks(tasks, nowMs) {
  return tasks.filter(t => {
    const next = nextCronRunMs(t.cron, t.createdAt);
    return next !== null && next < nowMs;
  });
}
