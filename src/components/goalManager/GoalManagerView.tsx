/**
 * GoalManagerView — Interactive TUI for managing session goals, tracking progress, and picking templates.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from '../../ink.js';
import { type GoalState, getFullGoalState, getLastAchieved, setFullGoalState } from '../../utils/sessionGoalState.js';

const GOAL_TEMPLATES: Array<{ key: string; label: string; condition: string }> = [
  { key: 'fix-build', label: '🔨 Fix Build', condition: 'the project builds without errors or stop after 30 turns' },
  { key: 'green-tests', label: '🧪 Green Tests', condition: 'all tests pass or stop after 50 turns' },
  {
    key: 'fix-typecheck',
    label: '🔍 Fix Typecheck',
    condition: 'typecheck passes with no errors or stop after 20 turns',
  },
  { key: 'fix-lint', label: '🧹 Fix Lint Errors', condition: 'all lint errors are resolved or stop after 20 turns' },
  {
    key: 'refactor',
    label: '🏗️ Safe Refactor',
    condition: 'refactor the code without breaking existing tests or stop after 40 turns',
  },
];

export interface GoalManagerViewProps {
  onDone: (result?: string, options?: { display?: 'skip' | 'system' | 'user'; shouldQuery?: boolean }) => void;
  onSetGoal?: (goalCondition: string) => void;
}

export function GoalManagerView({ onDone, onSetGoal }: GoalManagerViewProps): React.ReactNode {
  const [goalState, setGoalState] = useState<GoalState | null>(() => getFullGoalState());
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const lastAchieved = getLastAchieved();

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onDone();
      return;
    }

    // Toggle pause/resume
    if (input === 'p' && goalState) {
      const nextPaused = !goalState.paused;
      const updated: GoalState = {
        ...goalState,
        paused: nextPaused,
        updatedAt: new Date().toISOString(),
      };
      setFullGoalState(updated);
      setGoalState(updated);
      setStatusNotice(nextPaused ? 'Goal paused' : 'Goal resumed');
      return;
    }

    // Clear goal
    if (input === 'c' && goalState) {
      setFullGoalState(null);
      setGoalState(null);
      setStatusNotice('Goal cleared');
      return;
    }

    // Template selection navigation
    if (key.upArrow || input === 'k') {
      setSelectedTemplateIndex(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === 'j') {
      setSelectedTemplateIndex(prev => Math.min(GOAL_TEMPLATES.length - 1, prev + 1));
      return;
    }

    // Enter to apply selected template
    if (key.return && !goalState?.goal) {
      const selected = GOAL_TEMPLATES[selectedTemplateIndex];
      if (selected) {
        if (onSetGoal) {
          onSetGoal(selected.condition);
        } else {
          onDone(`Goal set: "${selected.condition}"`, { display: 'system', shouldQuery: true });
        }
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} borderStyle="round" borderColor="green">
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="green">
          ◎ Session Goal Manager
        </Text>
        <Text dimColor>Autonomous Execution</Text>
      </Box>

      {/* Notice */}
      {statusNotice && (
        <Box marginBottom={1}>
          <Text color="yellow">ℹ {statusNotice}</Text>
        </Box>
      )}

      {/* Active Goal Dashboard */}
      {goalState?.goal ? (
        <Box flexDirection="column" marginBottom={1} paddingX={1} borderStyle="single" borderColor="gray">
          <Box gap={1} marginBottom={1}>
            <Text bold color="white">
              Current Goal:
            </Text>
            <Text bold color="cyan">
              &quot;{goalState.condition || goalState.goal}&quot;
            </Text>
            <Text color={goalState.paused ? 'magenta' : 'green'}>{goalState.paused ? '[PAUSED ⏸]' : '[ACTIVE ◎]'}</Text>
          </Box>

          {/* Turn Budget Progress */}
          {goalState.maxTurns ? (
            <Box gap={2} marginBottom={1}>
              <Text dimColor>Turn Budget:</Text>
              <Text color="yellow">{renderProgressBar(goalState.turnsSpent || 0, goalState.maxTurns)}</Text>
              <Text dimColor>
                {goalState.turnsSpent || 0} / {goalState.maxTurns} turns
              </Text>
            </Box>
          ) : null}

          {/* Time & Links */}
          <Box gap={2}>
            {goalState.maxMinutes ? <Text dimColor>Time Budget: max {goalState.maxMinutes} min</Text> : null}
            {goalState.linkedWorkflowRunIds && goalState.linkedWorkflowRunIds.length > 0 ? (
              <Text dimColor>Linked Workflows: {goalState.linkedWorkflowRunIds.join(', ')}</Text>
            ) : null}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray">No active goal in current session.</Text>
          {lastAchieved && (
            <Box marginTop={1} gap={1}>
              <Text color="green">✓ Recently Achieved:</Text>
              <Text italic>&quot;{lastAchieved.goal}&quot;</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Quick Goal Templates Picker (when no active goal) */}
      {!goalState?.goal && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline color="white">
            Quick Launch Presets (Press Enter to Start):
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {GOAL_TEMPLATES.map((tpl, idx) => {
              const isSelected = idx === selectedTemplateIndex;
              return (
                <Box
                  key={tpl.key}
                  backgroundColor={isSelected ? '#064e3b' : undefined}
                  paddingX={1}
                  justifyContent="space-between"
                >
                  <Box gap={1}>
                    <Text color={isSelected ? 'green' : 'gray'}>{isSelected ? '▶' : ' '}</Text>
                    <Text bold={isSelected} color={isSelected ? 'white' : undefined}>
                      {tpl.label}
                    </Text>
                  </Box>
                  <Text dimColor>{tpl.condition}</Text>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Footer Hotkeys */}
      <Box
        marginTop={1}
        paddingTop={1}
        borderStyle="single"
        borderTop
        borderColor="gray"
        justifyContent="space-between"
      >
        <Text dimColor>
          {goalState?.goal
            ? '[p Pause/Resume]  [c Clear/Stop Goal]  [Esc Exit]'
            : '[↑/↓ Choose Preset]  [Enter Start Goal]  [Esc Exit]'}
        </Text>
      </Box>
    </Box>
  );
}

function renderProgressBar(current: number, max: number): string {
  const percentage = Math.min(100, Math.max(0, Math.round((current / max) * 100)));
  const totalBars = 10;
  const filled = Math.min(totalBars, Math.round((percentage / 100) * totalBars));
  const empty = Math.max(0, totalBars - filled);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`;
}
