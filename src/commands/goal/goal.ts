import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  getFullGoalState,
  setFullGoalState,
  type GoalState,
} from '../../utils/sessionGoalState.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { parseGoalBounds } from '../../services/goal/goalEvaluator.js'

/**
 * /goal command — sets a session goal that is shown in the footer status line.
 *
 * Usage:
 *   /goal              — show current goal
 *   /goal <text>       — set goal
 *   /goal clear        — remove goal
 *   /goal ""           — remove goal
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmed = args?.trim() ?? ''

  // Check if hooks are disabled — goal turn tracking depends on hooks for
  // counting, and a missing hook can cause the indicator to hang instead of
  // resolving. Show a clear message rather than silently stalling.
  if (trimmed && trimmed.toLowerCase() !== 'clear') {
    const settings = getSettings_DEPRECATED()
    if (settings.disableAllHooks || settings.allowManagedHooksOnly) {
      onDone(
        `Goal '${trimmed}' cannot be tracked: hooks are disabled (${settings.disableAllHooks ? 'disableAllHooks' : 'allowManagedHooksOnly'}). Goal-based turn tracking requires hooks to be enabled.`,
        { display: 'system' },
      )
      return null
    }
  }

  const state = context.getAppState()

  // Show current goal with stats
  if (!trimmed) {
    const currentGoal = state.sessionGoal
    if (currentGoal) {
      const goalState = getFullGoalState()
      const elapsed = state.sessionGoalStartTime
        ? Math.floor((Date.now() - state.sessionGoalStartTime) / 1000)
        : 0
      const turns = state.sessionGoalTurnCount ?? 0
      const elapsedStr = elapsed > 0
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : '0s'
      const tokens = goalState?.evalTokens ?? 0
      const tokenStr = tokens > 0
        ? ` · Eval tokens: ${tokens.toLocaleString()}`
        : ''
      const reason = goalState?.lastReason
        ? `\nLast check: ${goalState.lastReason}`
        : ''
      const bounds: string[] = []
      if (goalState?.maxTurns) bounds.push(`${goalState.maxTurns} turns`)
      if (goalState?.maxMinutes) bounds.push(`${goalState.maxMinutes} min`)
      const boundsStr = bounds.length > 0 ? ` [limits: ${bounds.join(', ')}]` : ''
      onDone(
        `Goal: ${currentGoal}${boundsStr}\nElapsed: ${elapsedStr} · Turns: ${turns}${tokenStr}${reason}`,
        { display: 'system' },
      )
    } else {
      onDone('No goal set. Usage: /goal <text> —or— /goal clear', { display: 'system' })
    }
    return null
  }

  // Clear goal
  if (trimmed.toLowerCase() === 'clear') {
    context.setAppState(prev => ({
      ...prev,
      sessionGoal: undefined,
      sessionGoalStartTime: undefined,
      sessionGoalTurnCount: undefined,
    }))
    setFullGoalState(null)

    onDone('Session goal cleared.', { display: 'system' })
    return null
  }

  // Parse goal condition and bounds
  const { condition, maxTurns, maxMinutes } = parseGoalBounds(trimmed)

  // Set goal
  const goalState: GoalState = {
    goal: trimmed,
    condition,
    maxTurns,
    maxMinutes,
    setAt: Date.now(),
    turnCount: 0,
    evalTokens: 0,
    lastReason: undefined,
    achieved: false,
  }

  context.setAppState(prev => ({
    ...prev,
    sessionGoal: trimmed,
    sessionGoalStartTime: Date.now(),
    sessionGoalTurnCount: 0,
    standaloneAgentContext: prev.standaloneAgentContext
      ? { ...prev.standaloneAgentContext }
      : undefined,
  }))
  setFullGoalState(goalState)

  const bounds: string[] = []
  if (maxTurns) bounds.push(`stop after ${maxTurns} turns`)
  if (maxMinutes) bounds.push(`stop after ${maxMinutes} min`)
  const boundsStr = bounds.length > 0 ? ` (${bounds.join(', ')})` : ''
  onDone(`Goal set: ${trimmed}${boundsStr}`, { display: 'system' })
  return null
}
