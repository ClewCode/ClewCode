import { join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import { getCwd } from './cwd.js'
import { pathExists } from './file.js'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'

/**
 * Persistent session goal state.
 *
 * Goal is set via /goal command:
 *   - Stored in AppState for the status line display
 *   - Synced to this module singleton for system prompt injection
 *   - Persisted to disk so it survives /clear, /compact, and session restarts
 *
 * Persistence path: ~/.claude/projects/<slug>/sessions/<sessionId>/goal.json
 */

/** Full goal state persisted to disk */
export type GoalState = {
  goal: string
  /** Parsed condition (without turn/time bound clauses) */
  condition?: string
  /** Turn limit if specified (e.g. "or stop after 20 turns") */
  maxTurns?: number
  /** Time limit in minutes if specified */
  maxMinutes?: number
  /** When the goal was set (timestamp) */
  setAt?: number
  /** Turn count since goal was set */
  turnCount?: number
  /** Total tokens spent on goal evaluation */
  evalTokens?: number
  /** Last evaluator reason */
  lastReason?: string
  /** Whether the goal was achieved */
  achieved?: boolean
  /** When the goal was achieved or cleared */
  endedAt?: number
}

let currentGoal: string | null = null
let currentGoalState: GoalState | null = null
let restored = false
let persistencePath: string | null = null

function getGoalFilePath(): string {
  if (persistencePath) return persistencePath
  const sessionId = getSessionId()
  const cwd = getCwd()
  const slug = Buffer.from(cwd).toString('base64url').slice(0, 32)
  persistencePath = join(
    process.env.HOME || process.env.USERPROFILE || '/tmp',
    '.claude', 'projects', slug, 'sessions', sessionId, 'goal.json',
  )
  return persistencePath
}

async function tryRestore(): Promise<void> {
  if (restored) return
  restored = true
  try {
    const filePath = getGoalFilePath()
    const exists = await pathExists(filePath)
    if (!exists) return
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as GoalState | { goal?: string }
    // Handle both old format ({ goal: string }) and new format (GoalState)
    if ('goal' in parsed && parsed.goal) {
      currentGoal = parsed.goal
      const fullState = 'condition' in parsed ? parsed as GoalState : null
      currentGoalState = fullState
      // If goal was already achieved or cleared, don't restore
      if (fullState && (fullState.achieved || fullState.endedAt)) {
        currentGoal = null
        currentGoalState = null
      }
    }
  } catch {
    // Non-fatal — goal stays null
  }
}

export function getSessionGoal(): string | null {
  return currentGoal
}

export function getFullGoalState(): GoalState | null {
  return currentGoalState
}

/**
 * Synchronous version for use in non-async contexts (e.g. system prompt builder).
 * Lazily triggers async restore on first call; subsequent calls use cached value.
 * The async restore races the first prompt — if not yet complete, returns null
 * for the first turn, then the restored value for subsequent turns.
 */
export function getSessionGoalSync(): string | null {
  if (!restored) {
    tryRestore()
  }
  return currentGoal
}

export function setSessionGoal(goal: string | null): void {
  currentGoal = goal
  restored = true // don't re-restore after explicit set
  if (goal === null) {
    currentGoalState = null
  }
  persistGoal(currentGoalState).catch(() => {})
}

/** Set the full goal state with all metadata */
export function setFullGoalState(state: GoalState | null): void {
  currentGoal = state?.goal ?? null
  currentGoalState = state
  restored = true
  persistGoal(state).catch(() => {})
}

/** Update specific fields in the goal state */
export function updateGoalState(updates: Partial<GoalState>): void {
  if (!currentGoalState) return
  currentGoalState = { ...currentGoalState, ...updates }
  persistGoal(currentGoalState).catch(() => {})
}

async function persistGoal(state: GoalState | null): Promise<void> {
  try {
    const filePath = getGoalFilePath()
    if (state === null) {
      try { await unlink(filePath) } catch { /* ENOENT ok */ }
    } else {
      await mkdir(join(filePath, '..'), { recursive: true })
      await writeFile(filePath, JSON.stringify(state), 'utf-8')
    }
  } catch {
    // Persistence failures are non-fatal — goal still works in-memory
  }
}
