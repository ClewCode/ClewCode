import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { Box, Text } from '../ink.js';
import type { OptionWithDescription } from './CustomSelect/select.js';
import { Select } from './CustomSelect/select.js';
import { PermissionDialog } from './permissions/PermissionDialog.js';

export type UpdateCalloutSelection = 'update' | 'keep' | 'manual';

type Props = {
  currentVersion: string;
  latestVersion: string;
  onDone: (selection: UpdateCalloutSelection) => void;
};

const AUTO_DISMISS_MS = 30_000;

/**
 * Startup dialog shown (alongside the logo) when a newer version is available
 * for a plain npm/bun global install. Lets the user choose to update now, stay
 * on the current version, or update themselves later — instead of the old
 * silent background auto-install.
 */
export function UpdateCallout({ currentVersion, latestVersion, onDone }: Props): React.ReactNode {
  // Latest-ref pattern so the auto-dismiss timer never captures a stale onDone.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const handleKeep = useCallback((): void => {
    onDoneRef.current('keep');
  }, []);

  // Auto-dismiss (keep current) if the user walks away.
  useEffect(() => {
    const timeoutId = setTimeout(handleKeep, AUTO_DISMISS_MS);
    return () => clearTimeout(timeoutId);
  }, [handleKeep]);

  const options: OptionWithDescription<UpdateCalloutSelection>[] = [
    { label: 'Update now (runs `npm install -g clew-code`)', value: 'update' },
    { label: 'Skip', value: 'keep' },
    { label: 'Skip until next version', value: 'manual' },
  ];

  return (
    <PermissionDialog title="✨ Update available!">
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text>
            <Text bold>{currentVersion}</Text> →{' '}
            <Text bold color="success">
              {latestVersion}
            </Text>
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Release notes: https://github.com/ClewCode/ClewCode/releases/latest</Text>
        </Box>
        <Select options={options} onChange={value => onDoneRef.current(value)} onCancel={handleKeep} />
        <Box marginTop={1}>
          <Text dimColor>Press enter to continue</Text>
        </Box>
      </Box>
    </PermissionDialog>
  );
}
