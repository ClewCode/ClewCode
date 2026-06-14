// ponytail: builds a system prompt section for active session goal
import { getFullGoalState } from './sessionGoalState.js';

export function getGoalPrompt(): string {
  const goal = getFullGoalState();
  if (!goal?.goal) return '';

  const turns = goal.turnCount ?? 0;
  const elapsed = goal.setAt ? Math.round((Date.now() - goal.setAt - (goal.totalPausedMs ?? 0)) / 1000) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  const lines: string[] = [
    '',
    '## Active Goal',
    '',
    `Goal: "${goal.goal}"`,
  ];

  if (goal.condition && goal.condition !== goal.goal) {
    lines.push(`Condition: ${goal.condition}`);
  }

  const parts: string[] = [`elapsed: ${mins}m ${secs}s`, `turns: ${turns}`];
  if (goal.maxTurns) parts.push(`limit: ${turns}/${goal.maxTurns} turns`);
  if (goal.maxMinutes) parts.push(`time limit: ${goal.maxMinutes}m`);
  lines.push(parts.join(' · '));

  if (goal.chain && goal.chain.length > 0) {
    lines.push(`Chain: current → ${goal.chain.join(' → ')}`);
  }

  if (goal.lastReason && turns > 0 && !goal.achieved) {
    lines.push(`Last evaluation: ${goal.lastReason}`);
  }

  lines.push(
    '',
    'Work autonomously toward this goal. Report progress when you hit milestones. If the goal is met, state it clearly.',
    '',
  );

  return lines.join('\n');
}
