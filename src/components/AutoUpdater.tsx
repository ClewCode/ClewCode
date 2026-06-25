import type * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import { useUpdateNotification } from '../hooks/useUpdateNotification.js';
import { Box, Text } from '../ink.js';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { getLatestVersion } from '../utils/autoUpdater.js';
import { isAutoUpdaterDisabled } from '../utils/config.js';
import { logForDebugging } from '../utils/debug.js';
import { lt } from '../utils/semver.js';

type Props = {
  isUpdating: boolean;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  onAutoUpdaterResult: (autoUpdaterResult: AutoUpdaterResult) => void;
  autoUpdaterResult: AutoUpdaterResult | null;
  showSuccessMessage: boolean;
  verbose: boolean;
};

export function AutoUpdater({ isUpdating, autoUpdaterResult, showSuccessMessage, verbose }: Props): React.ReactNode {
  const [versions, setVersions] = useState<{
    current?: string;
    latest?: string | null;
  }>({});
  const updateSemver = useUpdateNotification(autoUpdaterResult?.version);

  const checkForUpdates = useCallback(async () => {
    if (isAutoUpdaterDisabled()) {
      return;
    }

    const current = MACRO.VERSION;

    // Don't check during development
    if (current.includes('dev') || current.includes('0.0.0')) {
      return;
    }

    const latest = await getLatestVersion('latest');
    if (!latest) {
      return;
    }

    setVersions({ current, latest });

    if (latest !== current && lt(current, latest)) {
      logForDebugging(`AutoUpdater: Update available ${current} → ${latest}`);
    }
  }, []);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  useInterval(checkForUpdates, 30 * 60 * 1000);

  if (!isUpdating && !autoUpdaterResult?.version && !versions.latest) {
    return null;
  }

  return (
    <Box flexDirection="row" gap={1}>
      {verbose && versions.current && versions.latest && (
        <Text dimColor wrap="truncate">
          {versions.current} · latest: {versions.latest}
        </Text>
      )}

      {isUpdating && (
        <Box>
          <Text color="text" dimColor wrap="truncate">
            Updating…
          </Text>
        </Box>
      )}

      {autoUpdaterResult?.status === 'success' && showSuccessMessage && updateSemver && (
        <Text color="success" wrap="truncate">
          ✓ Update installed · Restart to apply
        </Text>
      )}

      {!autoUpdaterResult?.version && !isUpdating && versions.latest && lt(MACRO.VERSION, versions.latest) && (
        <Text wrap="truncate">
          Update {versions.latest} available · run <Text bold>clew update</Text>
        </Text>
      )}

      {(autoUpdaterResult?.status === 'install_failed' || autoUpdaterResult?.status === 'no_permissions') && (
        <Text color="error" wrap="truncate">
          ✗ Update failed · Try <Text bold>clew doctor</Text>
        </Text>
      )}
    </Box>
  );
}
