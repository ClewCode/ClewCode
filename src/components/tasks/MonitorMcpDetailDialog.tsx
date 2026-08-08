import type React from 'react';
import type { DeepImmutable } from 'src/types/utils.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import { Box, Text } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import type { MonitorMcpTaskState } from '../../tasks/MonitorMcpTask/MonitorMcpTask.js';
import { plural } from '../../utils/stringUtils.js';
import { Byline } from '../design-system/Byline.js';
import { Dialog } from '../design-system/Dialog.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';

type Props = {
  task: DeepImmutable<MonitorMcpTaskState>;
  onKill?: () => void;
  onBack: () => void;
};

/** Detail view for a monitor_mcp background task. */
export function MonitorMcpDetailDialog({ task, onKill, onBack }: Props): React.ReactNode {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'left' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'x' && !e.ctrl && !e.meta && task.status === 'running' && onKill) {
      e.preventDefault();
      onKill();
    }
  };

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="MCP server monitor"
        subtitle={
          <Text dimColor>
            {task.alerts.length > 0
              ? `${task.alerts.length} ${plural(task.alerts.length, 'server')} with alerts`
              : 'all servers healthy'}
          </Text>
        }
        onCancel={onBack}
        color="background"
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="←" action="go back" />
              {task.status === 'running' && onKill && <KeyboardShortcutHint shortcut="x" action="stop" />}
            </Byline>
          )
        }
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Status:</Text>{' '}
            {task.status === 'running' ? (
              <Text color="background">running</Text>
            ) : task.status === 'completed' ? (
              <Text color="success">{task.status}</Text>
            ) : (
              <Text color="error">{task.status}</Text>
            )}
          </Text>

          {task.alerts.length === 0 ? (
            <Text dimColor>{task.status === 'running' ? 'Watching…' : '(no alerts)'}</Text>
          ) : (
            task.alerts.map((server, i) => (
              <Box key={i} flexDirection="column">
                <Text wrap="wrap">{server}</Text>
              </Box>
            ))
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
