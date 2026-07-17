import type React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { truncate } from '../../utils/format.js';
import type { FollowupOutput } from './ScheduleFollowupTool.js';

export function renderFollowupToolUseMessage(
  input: Partial<{ summary: string; delayMinutes: number }>,
): React.ReactNode {
  const when = input.delayMinutes ? `+${input.delayMinutes}m` : '';
  const summary = input.summary ? truncate(input.summary, 60, true) : '';
  return [when, summary].filter(Boolean).join(' · ');
}

export function renderFollowupResultMessage(output: FollowupOutput): React.ReactNode {
  return (
    <MessageResponse>
      <Text>
        Follow-up <Text bold>{output.id}</Text> <Text dimColor>({output.when})</Text>
        {output.durable === false ? <Text dimColor> · session-only</Text> : <Text dimColor> · durable</Text>}
      </Text>
    </MessageResponse>
  );
}
