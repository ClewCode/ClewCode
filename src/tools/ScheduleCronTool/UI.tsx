import type React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { truncate } from '../../utils/format.js';

// break circular: UI was importing from Cron*Tool which imports from UI
type CreateOutput = any;
type DeleteOutput = any;
type ListOutput = any;

// --- CronCreate -------------------------------------------------------------

export function renderCreateToolUseMessage(
  input: Partial<{
    cron: string;
    prompt: string;
  }>,
): React.ReactNode {
  return `${input.cron ?? ''}${input.prompt ? `: ${truncate(input.prompt, 60, true)}` : ''}`;
}
export function renderCreateResultMessage(output: CreateOutput): React.ReactNode {
  return (
    <MessageResponse>
      <Text>
        Scheduled <Text bold>{output.id}</Text> <Text dimColor>({output.humanSchedule})</Text>
      </Text>
    </MessageResponse>
  );
}

// --- CronDelete -------------------------------------------------------------

export function renderDeleteToolUseMessage(
  input: Partial<{
    id: string;
  }>,
): React.ReactNode {
  return input.id ?? '';
}
export function renderDeleteResultMessage(output: DeleteOutput): React.ReactNode {
  return (
    <MessageResponse>
      <Text>
        Cancelled <Text bold>{output.id}</Text>
      </Text>
    </MessageResponse>
  );
}

// --- CronList ---------------------------------------------------------------

export function renderListToolUseMessage(): React.ReactNode {
  return '';
}
export function renderListResultMessage(output: ListOutput): React.ReactNode {
  if (output.jobs.length === 0) {
    return (
      <MessageResponse>
        <Text dimColor>No scheduled jobs</Text>
      </MessageResponse>
    );
  }
  return (
    <MessageResponse>
      {output.jobs.map((j: any) => (
        <Text key={j.id}>
          <Text bold>{j.id}</Text> <Text dimColor>{j.humanSchedule}</Text>
          {j.recurring ? <Text dimColor> (recurring)</Text> : <Text dimColor> (one-shot)</Text>}
          {j.durable === false && <Text dimColor> [session-only]</Text>}
          {j.prompt ? (
            <>
              : <Text>{truncate(j.prompt, 80, true)}</Text>
            </>
          ) : null}
        </Text>
      ))}
    </MessageResponse>
  );
}

// --- Shared -----------------------------------------------------------------
