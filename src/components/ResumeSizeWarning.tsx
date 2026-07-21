import type React from 'react';
import { Box, Text } from '../ink.js';
import { describeResumeSize, type ResumeSizeInfo } from '../utils/resumeSizeWarning.js';
import { Select } from './CustomSelect/index.js';

export type ResumeSizeChoice = 'summary' | 'full' | 'never-ask';

type Props = {
  info: ResumeSizeInfo;
  onChange: (choice: ResumeSizeChoice) => void;
  onCancel: () => void;
};

const OPTIONS: { label: string; value: ResumeSizeChoice }[] = [
  { label: 'Resume from summary (recommended)', value: 'summary' },
  { label: 'Resume full session as-is', value: 'full' },
  { label: "Don't ask me again", value: 'never-ask' },
];

export function ResumeSizeWarning({ info, onChange, onCancel }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{describeResumeSize(info)}</Text>
      <Text>
        Resuming the full session will consume a substantial portion of your usage limits. We recommend resuming from a
        summary.
      </Text>
      <Select options={OPTIONS} onChange={value => onChange(value as ResumeSizeChoice)} onCancel={onCancel} />
      <Text dimColor>Enter to confirm · Esc to cancel</Text>
    </Box>
  );
}
