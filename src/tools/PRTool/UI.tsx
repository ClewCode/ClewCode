import type * as React from 'react';
import { Box, Text } from '../../ink.js';

type PRInput = {
  action: string;
  pr_number?: number;
  branch?: string;
};

type PROutput = {
  success: boolean;
  action: string;
  message: string;
  data?: string;
};

export function renderToolUseMessage(input: PRInput): React.ReactNode {
  const label = input.action === 'create' ? 'Creating PR' : input.action === 'list' ? 'Listing PRs' : input.action === 'view' ? `Viewing PR #${input.pr_number}` : input.action === 'review' ? `Reviewing PR #${input.pr_number}` : input.action === 'merge' ? `Merging PR #${input.pr_number}` : input.action === 'status' ? 'Checking PR status' : `PR ${input.action}`;
  return (
    <Box>
      <Text color="cyan">PR</Text>
      <Text>{' '}</Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
}

export function renderToolResultMessage(output: PROutput): React.ReactNode {
  if (!output.success) {
    return (
      <Box>
        <Text color="error">PR {output.action} failed: {output.message}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>{output.message}</Text>
      {output.data && (
        <Box marginTop={1}>
          <Text>{output.data}</Text>
        </Box>
      )}
    </Box>
  );
}

export function renderToolUseRejectedMessage(): React.ReactNode {
  return (
    <Box>
      <Text dimColor>PR operation cancelled</Text>
    </Box>
  );
}
