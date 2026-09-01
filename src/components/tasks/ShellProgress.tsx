import type { ReactNode } from 'react';
import { Text, useAnimationFrame } from 'src/ink.js';
import type { TaskStatus } from 'src/Task.js';
import type { LocalShellTaskState } from 'src/tasks/LocalShellTask/guards.js';
import type { DeepImmutable } from 'src/types/utils.js';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL_MS = 80;

type TaskStatusTextProps = {
  status: TaskStatus;
  label?: string;
  suffix?: string;
};

export function TaskStatusText({ status, label, suffix }: TaskStatusTextProps): ReactNode {
  const displayLabel = label ?? status;
  const color =
    status === 'completed' ? 'success' : status === 'failed' ? 'error' : status === 'killed' ? 'warning' : undefined;
  return (
    <Text color={color} dimColor>
      ({displayLabel}
      {suffix})
    </Text>
  );
}

export function ShellProgress({ shell }: { shell: DeepImmutable<LocalShellTaskState> }): ReactNode {
  const isRunning = shell.status === 'running';
  const [, time] = useAnimationFrame(isRunning ? FRAME_INTERVAL_MS : null);
  const frame = Math.floor((time ?? 0) / FRAME_INTERVAL_MS) % BRAILLE_FRAMES.length;
  const glyph = BRAILLE_FRAMES[frame] ?? '⠋';

  switch (shell.status) {
    case 'completed':
      return (
        <TaskStatusText
          status="completed"
          label={`done${shell.result?.code !== undefined ? `:${shell.result.code}` : ''}`}
        />
      );
    case 'failed':
      return (
        <TaskStatusText
          status="failed"
          label={`error${shell.result?.code !== undefined ? `:${shell.result.code}` : ''}`}
        />
      );
    case 'killed':
      return <TaskStatusText status="killed" label="stopped" />;
    case 'running':
      return <Text dimColor>{glyph} running</Text>;
    case 'pending':
      return <Text dimColor>○ pending</Text>;
  }
}
