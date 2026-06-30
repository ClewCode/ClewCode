import type * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import { useUpdateNotification } from '../hooks/useUpdateNotification.js';
import { Box, Text } from '../ink.js';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { getLatestVersion, installGlobalPackage, resolveUpdateStrategy } from '../utils/autoUpdater.js';
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

export function AutoUpdater({
  isUpdating,
  onChangeIsUpdating,
  onAutoUpdaterResult,
  autoUpdaterResult,
  showSuccessMessage,
  verbose,
}: Props): React.ReactNode {
  const [versions, setVersions] = useState<{
    current?: string;
    latest?: string | null;
  }>({});
  const updateSemver = useUpdateNotification(autoUpdaterResult?.version);

  // Tracks the auto-install we've already attempted for a given target version,
  // so the 30-min interval doesn't re-install the same version on every tick.
  // The running process keeps its old MACRO.VERSION until restart, so
  // lt(current, latest) stays true after a successful install — we must not
  // loop on it. Failed installs are allowed to retry on the next tick.
  const autoInstall = useRef<{ version: string; outcome: 'done' | 'failed' } | null>(null);

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

    if (latest === current || !lt(current, latest)) {
      return;
    }

    logForDebugging(`AutoUpdater: Update available ${current} → ${latest}`);

    // Skip if we already installed this version, or an attempt is in flight.
    // (Re-attempt only if the previous attempt for this version failed.)
    if (autoInstall.current?.version === latest && autoInstall.current.outcome === 'done') {
      return;
    }
    if (isUpdating) {
      return;
    }

    // Only self-install plain npm/bun global installs. Native installs are
    // handled by NativeAutoUpdater, and system-package installs (brew/winget/
    // apt/…) must not be npm-installed over — just leave the "run clew update"
    // notice (clew update then prints the correct command for them).
    const strategy = await resolveUpdateStrategy();
    if (strategy.kind !== 'global') {
      logForDebugging(`AutoUpdater: skipping auto-install (install method: ${strategy.kind})`);
      return;
    }

    // Auto-install in the background. UI states (Updating… / ✓ installed /
    // ✗ failed) are driven by isUpdating + autoUpdaterResult below.
    onChangeIsUpdating(true);
    try {
      const status = await installGlobalPackage(latest);
      onAutoUpdaterResult({ version: latest, status });
      autoInstall.current = { version: latest, outcome: status === 'success' ? 'done' : 'failed' };
      logForDebugging(`AutoUpdater: auto-install ${latest} → ${status}`);
    } catch (error) {
      onAutoUpdaterResult({ version: latest, status: 'install_failed' });
      autoInstall.current = { version: latest, outcome: 'failed' };
      logForDebugging(`AutoUpdater: auto-install ${latest} threw ${String(error)}`);
    } finally {
      onChangeIsUpdating(false);
    }
  }, [isUpdating, onChangeIsUpdating, onAutoUpdaterResult]);

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
