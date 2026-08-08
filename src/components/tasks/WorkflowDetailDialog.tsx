import type React from 'react';
import type { DeepImmutable } from 'src/types/utils.js';
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js';
import { Box, Text } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LocalWorkflowTaskState } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js';
import { plural } from '../../utils/stringUtils.js';
import { Byline } from '../design-system/Byline.js';
import { Dialog } from '../design-system/Dialog.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';

type Props = {
  workflow: DeepImmutable<LocalWorkflowTaskState>;
  onDone: () => void;
  onKill?: () => void;
  onSkipAgent?: (agentId: string) => void;
  onRetryAgent?: (agentId: string) => void;
  onBack: () => void;
};

/** Detail view for a local_workflow background task. */
export function WorkflowDetailDialog({
  workflow,
  onDone,
  onKill,
  onSkipAgent,
  onRetryAgent,
  onBack,
}: Props): React.ReactNode {
  useKeybindings({ 'confirm:yes': onDone }, { context: 'Confirmation' });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'left' && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'x' && !e.ctrl && !e.meta && workflow.status === 'running' && onKill) {
      e.preventDefault();
      onKill();
    }
  };

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title="Workflow"
        subtitle={
          <Text dimColor>
            {workflow.agentIds.length} {plural(workflow.agentIds.length, 'agent')} in workflow
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
              <KeyboardShortcutHint shortcut="Esc/Enter" action="close" />
              {workflow.status === 'running' && onKill && <KeyboardShortcutHint shortcut="x" action="stop" />}
            </Byline>
          )
        }
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold>Status:</Text>{' '}
            {workflow.status === 'running' ? (
              <Text color="background">running</Text>
            ) : workflow.status === 'completed' ? (
              <Text color="success">{workflow.status}</Text>
            ) : (
              <Text color="error">{workflow.status}</Text>
            )}
          </Text>

          {workflow.agentIds.length === 0 ? (
            <Text dimColor>{workflow.status === 'running' ? 'Starting…' : '(no agents)'}</Text>
          ) : (
            workflow.agentIds.map((agentId, i) => (
              <Box key={i} flexDirection="column" gap={1}>
                <Text wrap="wrap">{agentId}</Text>
                {workflow.status === 'running' && (
                  <Box flexDirection="row" gap={1}>
                    {onSkipAgent && (
                      <Text dimColor>
                        <Text underline>s</Text>kip ·{' '}
                      </Text>
                    )}
                    {onRetryAgent && <Text dimColor>retry</Text>}
                  </Box>
                )}
              </Box>
            ))
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
