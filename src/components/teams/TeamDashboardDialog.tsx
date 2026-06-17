import type React from 'react';
import { useMemo, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import { useRegisterOverlay } from '../../context/overlayContext.js';
import type { Color } from '../../ink/styles.js';
import { Box, Text, useInput } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { useAppState } from '../../state/AppState.js';
import { isInProcessTeammateTask } from '../../tasks/InProcessTeammateTask/types.js';
import { toInkColor } from '../../utils/ink.js';
import { Byline } from '../design-system/Byline.js';
import { Dialog } from '../design-system/Dialog.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';
import { InProcessTeammateDetailDialog } from '../tasks/InProcessTeammateDetailDialog.js';

type Props = {
  onDone: () => void;
};

const CYAN = 'ansi:cyan' as Color;
const GREEN = 'ansi:green' as Color;
const RED = 'ansi:red' as Color;
const YELLOW = 'ansi:yellow' as Color;
const WHITE = 'ansi:white' as Color;

export function TeamDashboardDialog({ onDone }: Props): React.ReactNode {
  useRegisterOverlay('team-dashboard');

  const tasks = useAppState(s => s.tasks);
  const [selected, setSelected] = useState(0);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [_tick, setTick] = useState(0);

  useInterval(() => setTick(t => t + 1), 2000);

  const teammates = useMemo(() => {
    return Object.values(tasks).filter(isInProcessTeammateTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const idx = Math.min(selected, Math.max(0, teammates.length - 1));
  const current = teammates[idx];

  useInput(input => {
    if (['up', 'k'].includes(input)) setSelected(i => Math.max(0, i - 1));
    else if (['down', 'j'].includes(input)) setSelected(i => Math.min(teammates.length - 1, i + 1));
  });

  useKeybindings(
    {
      'confirm:yes': () => {
        if (current) setViewingId(current.id);
      },
    },
    { context: 'Confirmation' },
  );

  if (viewingId && tasks[viewingId] && isInProcessTeammateTask(tasks[viewingId])) {
    return (
      <InProcessTeammateDetailDialog
        teammate={tasks[viewingId]}
        onDone={() => setViewingId(null)}
        onBack={() => setViewingId(null)}
      />
    );
  }

  const statusTag = (s: string): [string, Color] => {
    switch (s) {
      case 'running':
        return ['\u25CF RUN', CYAN];
      case 'completed':
        return ['\u2713 DONE', GREEN];
      case 'failed':
        return ['\u2717 FAIL', RED];
      case 'killed':
        return ['\u2298 KILL', YELLOW];
      default:
        return ['\u25CB IDLE', WHITE];
    }
  };

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus>
      <Dialog
        title={<Text bold>Team Dashboard</Text>}
        subtitle={
          <Text dimColor>
            {teammates.length} teammate{teammates.length !== 1 ? 's' : ''}
          </Text>
        }
        onCancel={onDone}
        inputGuide={() => (
          <Byline>
            <KeyboardShortcutHint shortcut={'\u2191\u2193'} action="navigate" />
            <KeyboardShortcutHint shortcut="Enter" action="detail" />
            <KeyboardShortcutHint shortcut="Esc" action="close" />
          </Byline>
        )}
      >
        {teammates.length === 0 ? (
          <Box padding={1}>
            <Text dimColor>No active teammates.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" minHeight={3}>
            {teammates.map((t, i) => {
              const isSel = i === idx;
              const p = t.progress;
              const lastAct = p?.recentActivities?.slice(-1)?.[0];
              const activity = lastAct?.activityDescription ?? '';
              const [tag, tagColor] = statusTag(t.status);

              return (
                <Box key={t.id} paddingLeft={1}>
                  <Text color={isSel ? CYAN : WHITE} bold={isSel}>
                    {isSel ? '\u2038 ' : '  '}
                  </Text>
                  <Text color={toInkColor(t.identity?.color)}>@{t.identity?.agentName ?? '?'}</Text>
                  <Text> </Text>
                  <Text color={tagColor} bold>
                    {tag}
                  </Text>
                  {activity && (
                    <Text dimColor wrap="truncate-end">
                      {' '}
                      {'\u00B7'} {activity.slice(0, 60)}
                    </Text>
                  )}
                  {t.status === 'running' && p && (
                    <Text dimColor>
                      {' \u00B7 '}
                      {p.toolUseCount ?? 0} tools {'\u00B7'} {(p.tokenCount ?? 0).toLocaleString()} tok
                    </Text>
                  )}
                  {t.awaitingPlanApproval && <Text color={YELLOW}> [waiting]</Text>}
                </Box>
              );
            })}
          </Box>
        )}
      </Dialog>
    </Box>
  );
}
