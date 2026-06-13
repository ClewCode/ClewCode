import type { StructuredPatchHunk } from 'diff';
import type * as React from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { count } from '../utils/array.js';
import { MessageResponse } from './MessageResponse.js';
import { StructuredDiffList } from './StructuredDiffList.js';

type Props = {
  filePath: string;
  structuredPatch: StructuredPatchHunk[];
  firstLine: string | null;
  fileContent?: string;
  style?: 'condensed';
  verbose: boolean;
  previewHint?: string;
};

export function FileEditToolUpdatedMessage({
  filePath,
  structuredPatch,
  firstLine,
  fileContent,
  style,
  verbose,
  previewHint,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize();
  const numAdditions = structuredPatch.reduce((acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('+')), 0);
  const numRemovals = structuredPatch.reduce((acc, hunk) => acc + count(hunk.lines, _ => _.startsWith('-')), 0);

  const text = (
    <Text>
      Updated {filePath} (<Text color="diffAddedWord">+{numAdditions}</Text>{' '}
      <Text color="diffRemovedWord">-{numRemovals}</Text>)
    </Text>
  );

  // Plan files: invert condensed behavior
  // - Regular mode: just show the hint (user can type /plan to see full content)
  // - Condensed mode (subagent view): show the diff
  if (previewHint) {
    if (style !== 'condensed' && !verbose) {
      return (
        <MessageResponse>
          <Text dimColor>{previewHint}</Text>
        </MessageResponse>
      );
    }
  } else if (style === 'condensed' && !verbose) {
    return text;
  }

  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text>{text}</Text>
        <StructuredDiffList
          hunks={structuredPatch}
          dim={false}
          width={columns - 12}
          filePath={filePath}
          firstLine={firstLine}
          fileContent={fileContent}
        />
      </Box>
    </MessageResponse>
  );
}
