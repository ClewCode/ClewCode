import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { z } from 'zod/v4';
import { parseGoalBounds } from '../../services/goal/goalEvaluator.js';
import { buildTool } from '../../Tool.js';
import { setExecutionMode } from '../../utils/executionMode.js';
import { type GoalState, getFullGoalState, setFullGoalState } from '../../utils/sessionGoalState.js';

const inputSchema = z.strictObject({
  action: z
    .enum(['set', 'update', 'complete', 'clear'])
    .describe('Action: set a new goal, update condition, mark complete, or clear'),
  goal: z
    .string()
    .optional()
    .describe('Goal condition (for set/update). Use "then" for chains: "fix build" then "tests pass"'),
  reason: z.string().optional().describe('Brief reason for completion or update'),
});

const outputSchema = z.object({
  action: z.string(),
  goal: z.string().optional(),
  status: z.string(),
  chainRemaining: z.array(z.string()).optional(),
});

function parseGoalChain(input: string): { first: string; chain: string[] } | null {
  const parts = input
    .split(/\s+then\s+/i)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0]!, chain: parts.slice(1) };
}

const GOAL_TOOL_NAME = 'Goal';

export const GoalTool = buildTool({
  name: GOAL_TOOL_NAME,
  searchHint: 'set track goal progress autonomous',
  maxResultSizeChars: 2000,
  get inputSchema() {
    return inputSchema;
  },
  get outputSchema() {
    return outputSchema;
  },
  isEnabled: () => true,
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  userFacingName: () => 'Goal',
  getActivityDescription(input) {
    return input.action === 'set' ? `Setting goal: ${input.goal?.slice(0, 40)}` : `Goal ${input.action}`;
  },
  async description(input) {
    return `Goal: ${input.action} — ${input.goal?.slice(0, 80) ?? 'current'}`;
  },
  async prompt() {
    return `
## Goal Setting
Use the **Goal** tool to track your progress on complex multi-step tasks.
- **set**: Break down the user's request into a goal chain. Use "then" between steps: "fix build" then "run tests" then "lint clean"
- **update**: When conditions change or a step needs refinement
- **complete**: Mark the current goal as achieved (auto-advances to next in chain)
- **clear**: Remove the goal when all work is done

Always set a goal when the user gives you a complex task (>3 steps). This helps track progress, shows progress bars, and saves evaluation cost with heuristics.
`;
  },
  async checkPermissions(): Promise<PermissionResult> {
    return { behavior: 'allow', updatedInput: {} };
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: [{ type: 'text', text }],
    };
  },

  async call(input, context, _canUseTool, _parentMessage) {
    const { action, goal, reason } = input;
    const existing = getFullGoalState();

    if (action === 'clear') {
      setFullGoalState(null);
      setExecutionMode('safe');
      return { data: { action: 'clear', status: 'Goal cleared' } };
    }

    if (action === 'complete') {
      if (!existing?.goal) {
        return { data: { action: 'complete', status: 'No active goal' } };
      }
      // Advance chain or mark achieved
      if (existing.chain && existing.chain.length > 0) {
        const next = existing.chain[0]!;
        const { condition, maxTurns, maxMinutes } = parseGoalBounds(next);
        const updated: GoalState = {
          goal: next,
          condition,
          maxTurns,
          maxMinutes,
          setAt: Date.now(),
          turnCount: 0,
          evalTokens: 0,
          chain: existing.chain.slice(1),
          chainIndex: (existing.chainIndex ?? 0) + 1,
          preGoalMode: existing.preGoalMode,
          paused: false,
          totalPausedMs: 0,
        };
        setFullGoalState(updated);
        return {
          data: {
            action: 'complete',
            goal: next,
            status: `Advanced to next goal in chain`,
            chainRemaining: updated.chain,
          },
        };
      }
      existing.achieved = true;
      existing.endedAt = Date.now();
      existing.lastReason = reason || 'Goal achieved';
      setFullGoalState(existing);
      setExecutionMode('safe');
      return { data: { action: 'complete', goal: existing.goal, status: 'Goal marked as achieved' } };
    }

    if (!goal) {
      return { data: { action, status: 'No goal text provided' } };
    }

    // set or update
    const chain = parseGoalChain(goal);
    const effectiveGoal = chain ? chain.first : goal;
    const { condition, maxTurns, maxMinutes } = parseGoalBounds(effectiveGoal);

    const newGoal: GoalState = {
      goal: effectiveGoal,
      condition,
      maxTurns,
      maxMinutes,
      setAt: Date.now(),
      turnCount: action === 'update' ? (existing?.turnCount ?? 0) : 0,
      evalTokens: action === 'update' ? (existing?.evalTokens ?? 0) : 0,
      achieved: false,
      preGoalMode: context.getAppState().toolPermissionContext?.mode,
      paused: false,
      totalPausedMs: 0,
      chain: chain?.chain,
      chainIndex: 0,
    };

    setFullGoalState(newGoal);
    setExecutionMode('afk');

    return {
      data: {
        action,
        goal: effectiveGoal,
        status: chain
          ? `Goal set with ${chain.chain.length + 1}-step chain`
          : `Goal ${action === 'update' ? 'updated' : 'set'}`,
        chainRemaining: chain?.chain,
      },
    };
  },
});
