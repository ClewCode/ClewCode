import { parseGoalBounds } from '../../services/goal/goalEvaluator.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import {
  type GoalState,
  getFullGoalState,
  getLastAchieved,
  linkWorkflowToActiveGoal,
  setFullGoalState,
  blockGoal,
} from '../../utils/sessionGoalState.js';
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js';

/**
 * `/goal` command — sets a session goal that is shown in the footer status line.
 *
 * Usage:
 *   /goal              — show current goal (or most recently finished one)
 *   /goal status       — same as `/goal` with no args
 *   /goal <text>       — set goal (replaces an active one)
 *   /goal edit <text>  — update the condition while keeping turn count + timer
 *   /goal clear        — remove goal (aliases: stop, off, reset, none, cancel)
 *   /goal pause        — pause goal (restore permissions, keep state)
 *   /goal resume       — resume a paused goal
 *
 * Budget syntax (parsed from the condition text):
 *   "or stop after 20 turns"     → maxTurns: 20
 *   "or stop after 30 min"       → maxMinutes: 30
 *
 * Status indicators:
 *   ◎ active   ⏸ paused   ✓ achieved recently
 *
 * Implementation note: the command is a thin wrapper. All state
 * mutation lives in `sessionGoalState.ts`; this file is responsible
 * only for argument parsing, human-readable formatting, and side
 * effects on `toolPermissionContext` (goal mode forces
 * `bypassPermissions` so the agent can run unattended).
 */

const CLEAR_VERBS = new Set(['clear', 'stop', 'off', 'reset', 'none', 'cancel']);
const UNBLOCK_VERBS = new Set(['unblock', 'resume', 'continue']);

const WARN_THRESHOLD = 0.8;

/** Build a text-based mini progress bar that renders on any terminal. */
function renderTextProgressBar(ratio: number, width: number = 20): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${Math.round(clamped * 100)}%`;
}

/** Format elapsed time in a human readable way */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function renderBlockedStatus(state: AppStateSnapshot, goal: GoalState): string {
  const now = Date.now();
  const totalPausedMs = goal.totalPausedMs ?? 0;
  const rawElapsed = state.sessionGoalStartTime ? now - state.sessionGoalStartTime : 0;
  const activeElapsed = Math.max(0, rawElapsed - totalPausedMs);
  const turns = state.sessionGoalTurnCount ?? 0;
  const elapsedStr = formatElapsed(activeElapsed);

  const lines: string[] = [];
  lines.push(`⊘ Goal [BLOCKED]  ${goal.goal}`);
  lines.push('');
  lines.push(`  ${elapsedStr} · ${turns} turns`);
  if (goal.blockedReason) {
    lines.push('');
    lines.push(`  reason: ${goal.blockedReason}`);
  }
  if (goal.linkedWorkflowRunIds && goal.linkedWorkflowRunIds.length > 0) {
    lines.push('');
    lines.push(
      `  workflows: ${goal.linkedWorkflowRunIds.length} linked run${goal.linkedWorkflowRunIds.length === 1 ? '' : 's'} (see /workflow)`,
    );
  }
  return lines.join('\n');
}

/** Compose a human-readable status block for an active or paused goal. */
function renderActiveStatus(state: AppStateSnapshot, goal: GoalState): string {
  const now = Date.now();
  const totalPausedMs = goal.totalPausedMs ?? 0;
  const rawElapsed = state.sessionGoalStartTime ? now - state.sessionGoalStartTime : 0;
  const activeElapsed = Math.max(0, rawElapsed - totalPausedMs);
  const turns = state.sessionGoalTurnCount ?? 0;
  const elapsedStr = formatElapsed(activeElapsed);
  const tokens = goal.evalTokens ?? 0;
  const isPaused = goal.paused ?? false;

  // Show blocked status first if goal is blocked
  if (goal.blocked) {
    return renderBlockedStatus(state, goal);
  }

  const lines: string[] = [];
  const statusIcon = isPaused ? '⏸' : '◎';
  const statusLabel = isPaused ? 'PAUSED' : 'ACTIVE';
  lines.push(`${statusIcon} Goal [${statusLabel}]  ${goal.goal}`);
  lines.push('');

  // Time + turns
  const parts: string[] = [`elapsed ${elapsedStr}`, `turns ${turns}`];
  if (tokens > 0) parts.push(`eval tokens ${tokens.toLocaleString()}`);
  lines.push(`  ${parts.join('  ·  ')}`);

  // Bounds + budget warnings
  const warnings: string[] = [];
  if (goal.maxTurns) {
    const ratio = turns / goal.maxTurns;
    lines.push(`  turns:  ${renderTextProgressBar(ratio)}  (${turns}/${goal.maxTurns})`);
    if (ratio >= WARN_THRESHOLD) warnings.push(`${Math.round(ratio * 100)}% of turn budget used`);
  }
  if (goal.maxMinutes) {
    const elapsedMinutes = activeElapsed / 60_000;
    const ratio = elapsedMinutes / goal.maxMinutes;
    lines.push(`  time:   ${renderTextProgressBar(ratio)}  (${Math.round(elapsedMinutes)}/${goal.maxMinutes} min)`);
    if (ratio >= WARN_THRESHOLD) warnings.push(`${Math.round(ratio * 100)}% of time budget used`);
  }
  if (goal.maxTurns && turns >= goal.maxTurns)
    warnings.push('turn budget exhausted — goal will be cleared on next clear or session end');
  if (goal.maxMinutes && activeElapsed / 60_000 >= goal.maxMinutes) warnings.push('time budget exhausted');

  // Evaluator feedback
  if (goal.lastReason) {
    lines.push('');
    lines.push(`  evaluator: ${goal.lastReason}`);
  }

  // Linked workflows
  if (goal.linkedWorkflowRunIds && goal.linkedWorkflowRunIds.length > 0) {
    lines.push('');
    lines.push(
      `  workflows: ${goal.linkedWorkflowRunIds.length} linked run${goal.linkedWorkflowRunIds.length === 1 ? '' : 's'} (see /workflow)`,
    );
  }

  // Permission mode
  lines.push('');
  lines.push(`  permissions: ${state.toolPermissionContext?.mode ?? 'unknown'}`);

  if (warnings.length > 0) {
    lines.push('');
    for (const w of warnings) lines.push(`  ⚠ ${w}`);
  }

  return lines.join('\n');
}

/** Compose a status block for a recently finished goal. */
function renderAchievedStatus(goal: GoalState): string {
  const elapsed =
    goal.endedAt && goal.setAt ? formatElapsed(goal.endedAt - goal.setAt - (goal.totalPausedMs ?? 0)) : '0s';
  const turns = goal.turnCount ?? 0;
  const tokens = goal.evalTokens ?? 0;
  const lines: string[] = [];
  const statusIcon = goal.achieved ? '✓' : '◎';
  const statusLabel = goal.achieved ? 'ACHIEVED' : 'CLEARED';
  lines.push(`${statusIcon} Last goal [${statusLabel}]  ${goal.goal}`);
  lines.push('');
  const parts: string[] = [`elapsed ${elapsed}`, `turns ${turns}`];
  if (tokens > 0) parts.push(`eval tokens ${tokens.toLocaleString()}`);
  if (goal.endedAt) parts.push(`ended ${new Date(goal.endedAt).toLocaleString()}`);
  lines.push(`  ${parts.join('  ·  ')}`);
  if (goal.lastReason) {
    lines.push('');
    lines.push(`  last evaluator: ${goal.lastReason}`);
  }
  return lines.join('\n');
}

function renderNoGoalHelp(): string {
  return [
    '◎ No goal set.',
    '',
    '  /goal <text>              set a goal (claude works until the condition holds)',
    '  /goal edit <text>         update the condition (keeps turn count + timer)',
    '  /goal status              show current or last-finished goal',
    '  /goal pause | resume      pause / resume autonomous execution',
    '  /goal clear               remove the active goal',
    '',
    '  Bound a run with:  /goal "all tests pass or stop after 20 turns"',
    '  Run unattended:    /goal "build is green"  +  --permission-mode auto',
  ].join('\n');
}

type AppStateSnapshot = {
  sessionGoal?: string;
  sessionGoalStartTime?: number;
  sessionGoalTurnCount?: number;
  toolPermissionContext?: { mode?: string };
};

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmed = args?.trim() ?? '';
  const tokens = trimmed ? trimmed.split(/\s+/) : [];
  const first = (tokens[0] || '').toLowerCase();
  const rest = tokens.slice(1).join(' ').trim();
  const appState = context.getAppState();

  // ── Hooks disabled gate ──────────────────────────────────────────────────
  // Goal turn tracking depends on hooks. Show a clear message rather
  // than silently stalling.
  if (
    trimmed &&
    first !== 'status' &&
    first !== 'show' &&
    first !== 'pause' &&
    first !== 'resume' &&
    !CLEAR_VERBS.has(first)
  ) {
    const settings = getSettings_DEPRECATED();
    if (settings.disableAllHooks || settings.allowManagedHooksOnly) {
      const reason = settings.disableAllHooks ? 'disableAllHooks' : 'allowManagedHooksOnly';
      onDone(
        `◎ Goal cannot be tracked: hooks are disabled (${reason}). Goal-based turn tracking requires hooks to be enabled.`,
        { display: 'system' },
      );
      return null;
    }
  }

  // ── Status: /goal, /goal status, /goal show ─────────────────────────────
  if (!trimmed || first === 'status' || first === 'show') {
    const currentGoal = appState.sessionGoal;
    if (currentGoal) {
      const goalState = getFullGoalState();
      if (goalState) {
        onDone(renderActiveStatus(appState as AppStateSnapshot, goalState), { display: 'system' });
      } else {
        onDone(`◎ Goal [ACTIVE]  ${currentGoal}\n  (state file missing — using fallback)`, { display: 'system' });
      }
    } else {
      const last = getLastAchieved();
      if (last) {
        onDone(renderAchievedStatus(last), { display: 'system' });
      } else {
        onDone(renderNoGoalHelp(), { display: 'system' });
      }
    }
    return null;
  }

  // ── Pause ────────────────────────────────────────────────────────────────
  if (first === 'pause') {
    const goalState = getFullGoalState();
    if (!goalState?.goal) {
      onDone('◎ No active goal to pause.', { display: 'system' });
      return null;
    }
    if (goalState.paused) {
      onDone('◎ Goal is already paused. Use /goal resume to continue.', { display: 'system' });
      return null;
    }
    if (goalState.blocked) {
      onDone('◎ Goal is blocked. Use /goal clear to remove it, or /goal edit to update the condition.', {
        display: 'system',
      });
      return null;
    }

    const restoredMode = goalState.preGoalMode;
    goalState.paused = true;
    goalState.pausedAt = Date.now();
    goalState.lastReason = 'paused by user';
    setFullGoalState(goalState);

    context.setAppState(prev => ({
      ...prev,
      sessionGoalPaused: true,
      toolPermissionContext: restoredMode
        ? { ...prev.toolPermissionContext, mode: restoredMode }
        : prev.toolPermissionContext,
    }));

    const restoreMsg = restoredMode ? `  permissions restored to '${restoredMode}'.` : '';
    onDone(
      `⏸ Goal paused: "${goalState.goal}"\n  ${formatElapsed(Date.now() - (goalState.setAt ?? Date.now()))} elapsed · ${goalState.turnCount ?? 0} turns.${restoreMsg}\n  Use /goal resume to continue.`,
      { display: 'system' },
    );
    return null;
  }

  // ── Resume ───────────────────────────────────────────────────────────────
  if (first === 'resume') {
    const goalState = getFullGoalState();
    if (!goalState?.goal) {
      onDone('◎ No goal to resume. Set one with /goal <text>.', { display: 'system' });
      return null;
    }
    if (!goalState.paused) {
      onDone('◎ Goal is not paused — it is already active.', { display: 'system' });
      return null;
    }

    const pausedMs = goalState.pausedAt ? Date.now() - goalState.pausedAt : 0;
    goalState.totalPausedMs = (goalState.totalPausedMs ?? 0) + pausedMs;
    goalState.paused = false;
    goalState.pausedAt = undefined;
    goalState.blocked = false;
    goalState.blockedAt = undefined;
    goalState.blockedReason = undefined;
    goalState.lastReason = undefined;
    setFullGoalState(goalState);

    context.setAppState(prev => ({
      ...prev,
      sessionGoalPaused: false,
      sessionGoalTotalPausedMs: goalState.totalPausedMs,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        mode: 'bypassPermissions',
      },
    }));

    const elapsed = goalState.setAt ? formatElapsed(Date.now() - goalState.setAt - (goalState.totalPausedMs ?? 0)) : '';
    const turns = goalState.turnCount ?? 0;
    onDone(
      `▶ Goal resumed: "${goalState.goal}"\n  ${elapsed} elapsed · ${turns} turns · permissions: bypassPermissions`,
      {
        display: 'system',
        shouldQuery: true,
        metaMessages: [
          `Autonomous Agent Mode re-activated. Your active goal is: "${goalState.goal}". Please continue working autonomously toward this goal. Permissions are automatically bypassed for execution.`,
        ],
      },
    );
    return null;
  }

  // ── Edit: /goal edit <text> (explicit keyword only) ──────────────────────
  // Falls through to set-goal if no active goal or no rest text.
  if (first === 'edit' && rest) {
    const goalState = getFullGoalState();
    if (goalState?.goal) {
      const { condition, maxTurns, maxMinutes } = parseGoalBounds(rest);
      const updated: GoalState = {
        ...goalState,
        goal: rest,
        condition,
        maxTurns,
        maxMinutes,
      };
      setFullGoalState(updated);
      context.setAppState(prev => ({ ...prev, sessionGoal: rest }));
      const bounds: string[] = [];
      if (maxTurns) bounds.push(`max ${maxTurns} turns`);
      if (maxMinutes) bounds.push(`max ${maxMinutes} min`);
      const boundsMsg = bounds.length > 0 ? ` (${bounds.join(', ')})` : '';
      onDone(`◎ Goal updated.${boundsMsg}\n  "${rest}"`, {
        display: 'system',
        shouldQuery: true,
        metaMessages: [`Your active goal condition has been updated to: "${rest}".`],
      });
      return null;
    }
    // No active goal — fall through to set
  }

  // ── Clear: /goal clear (no extra text) ───────────────────────────────────
  if (CLEAR_VERBS.has(first) && !rest) {
    const goalState = getFullGoalState();
    const restoredMode = goalState?.preGoalMode;
    const turns = goalState?.turnCount ?? appState.sessionGoalTurnCount ?? 0;
    const pausedMs = goalState?.totalPausedMs ?? 0;
    const elapsed = goalState?.setAt ? formatElapsed(Date.now() - goalState.setAt - pausedMs) : '0s';
    const tokens_ = goalState?.evalTokens ?? 0;

    if (goalState) {
      setFullGoalState({ ...goalState, lastReason: 'manually cleared', endedAt: Date.now() });
    }

    context.setAppState(prev => ({
      ...prev,
      sessionGoal: undefined,
      sessionGoalStartTime: undefined,
      sessionGoalTurnCount: undefined,
      sessionGoalPaused: undefined,
      sessionGoalTotalPausedMs: undefined,
      toolPermissionContext: restoredMode
        ? { ...prev.toolPermissionContext, mode: restoredMode }
        : prev.toolPermissionContext,
    }));
    setFullGoalState(null);

    const statsLine = `${elapsed} · ${turns} turns${tokens_ > 0 ? ` · ${tokens_.toLocaleString()} eval tokens` : ''}`;
    const restoreMsg = restoredMode ? `\n  permissions restored to '${restoredMode}'` : '';
    onDone(`◎ Goal cleared.\n  ${statsLine}${restoreMsg}\n  (run /goal again to see the finished stats next time)`, {
      display: 'system',
    });
    return null;
  }

  // ── Set (set or replace) ─────────────────────────────────────────────────
  const { condition, maxTurns, maxMinutes } = parseGoalBounds(trimmed);

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
    preGoalMode: appState.toolPermissionContext?.mode,
    paused: false,
    totalPausedMs: 0,
  };

  context.setAppState(prev => ({
    ...prev,
    sessionGoal: trimmed,
    sessionGoalStartTime: Date.now(),
    sessionGoalTurnCount: 0,
    sessionGoalPaused: false,
    sessionGoalTotalPausedMs: 0,
    standaloneAgentContext: prev.standaloneAgentContext ? { ...prev.standaloneAgentContext } : undefined,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      mode: 'bypassPermissions',
    },
  }));
  setFullGoalState(goalState);

  const lines: string[] = [];
  lines.push('◎ Goal activated');
  lines.push(`  "${trimmed}"`);
  lines.push('');

  if (condition !== trimmed) {
    lines.push(`  condition: "${condition}"`);
  }

  const bounds: string[] = [];
  if (maxTurns) bounds.push(`stop after ${maxTurns} turns`);
  if (maxMinutes) bounds.push(`stop after ${maxMinutes} min`);
  if (bounds.length > 0) {
    lines.push(`  bounds: ${bounds.join('  ·  ')}`);
  }

  const prevMode = appState.toolPermissionContext?.mode ?? 'default';
  lines.push(`  permissions: ${prevMode} → bypassPermissions`);
  lines.push('');
  lines.push('  claude works autonomously. /goal to check, /goal pause to pause, /goal clear to stop.');

  onDone(lines.join('\n'), {
    display: 'system',
    shouldQuery: true,
    metaMessages: [
      `Autonomous Agent Mode activated. Your active goal is: "${trimmed}"${bounds.length > 0 ? ` (${bounds.join(', ')})` : ''}. Please proceed autonomously with the tools available to achieve this goal. Permissions are automatically bypassed for execution.`,
    ],
  });
  return null;
}

export { linkWorkflowToActiveGoal };
