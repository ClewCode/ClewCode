import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from '../ink.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';

type Props = {
  /** Linked project roots not yet loaded as working directories. */
  pendingLinks: string[];
  onDone(decision: 'yes' | 'no'): void;
  isStandaloneDialog?: boolean;
};

/**
 * Startup prompt shown when the current repo's `.clew/workspace.json` links to
 * other projects that aren't loaded yet. Confirming adds them as working
 * directories so linked projects are available without re-entering paths.
 */
export function WorkspaceLinkDialog({ pendingLinks, onDone, isStandaloneDialog }: Props): React.ReactNode {
  const handleEscape = useCallback(() => {
    onDone('no');
  }, [onDone]);

  return (
    <Dialog
      title={`Load ${pendingLinks.length} linked project${pendingLinks.length === 1 ? '' : 's'}?`}
      color="permission"
      onCancel={handleEscape}
      hideBorder={!isStandaloneDialog}
      hideInputGuide={!isStandaloneDialog}
    >
      <Text>This project is linked to other repositories. Load them as working directories for this session?</Text>

      <Box flexDirection="column">
        <Text dimColor>Linked projects:</Text>
        {pendingLinks.map(dir => (
          <Text key={dir} dimColor>
            {'  '}
            {dir}
          </Text>
        ))}
      </Box>

      <Select
        options={[
          { label: 'Yes, load linked projects', value: 'yes' },
          { label: 'No, keep them unlinked this session', value: 'no' },
        ]}
        onChange={value => onDone(value as 'yes' | 'no')}
      />
    </Dialog>
  );
}
