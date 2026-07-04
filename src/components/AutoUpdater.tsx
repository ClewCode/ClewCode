import type * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import { useUpdateNotification } from '../hooks/useUpdateNotification.js';
import { Box, Text } from '../ink.js';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { getLatestVersion, installGlobalPackage, resolveUpdateStrategy } from '../utils/autoUpdater.js';
import { isAutoUpdaterDisabled } from '../utils/config.js';
import { logForDebugging } from '../utils/debug.js';
import { lt } from '../utils/semver.js';
import {
  getConfirmedUpdate,
  isUpdateDismissed,
  setPendingUpdate,
  subscribePendingUpdate,
  takeConfirmedUpdate,
} from '../utils/updatePrompt.js';

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

    // An install kicked off from the dialog is in flight — don't re-prompt.
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

    // Instead of silently installing, surface a choice to the user (Update now /
    // Keep / I'll update myself). The REPL renders the dialog via its
    // focusedInputDialog machine off the shared updatePrompt store; the actual
    // install runs from there when the user picks "Update now". isUpdating +
    // autoUpdaterResult still drive the footer UI states below.
    if (!isUpdateDismissed(latest)) {
      logForDebugging(`AutoUpdater: prompting for update ${current} → ${latest}`);
      setPendingUpdate(latest);
    }
  }, [isUpdating, onChangeIsUpdating, onAutoUpdaterResult]);

  const runInstall = useCallback(
    async (latest: string) => {
      onChangeIsUpdating(true);
      try {
        const status = await installGlobalPackage(latest);
        onAutoUpdaterResult({ version: latest, status });
        logForDebugging(`AutoUpdater: install ${latest} → ${status}`);
      } catch (error) {
        onAutoUpdaterResult({ version: latest, status: 'install_failed' });
        logForDebugging(`AutoUpdater: install ${latest} threw ${String(error)}`);
      } finally {
        onChangeIsUpdating(false);
      }
    },
    [onChangeIsUpdating, onAutoUpdaterResult],
  );

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  useInterval(checkForUpdates, 30 * 60 * 1000);

  // Run the install when the user confirms "Update now" in the dialog (REPL
  // sets confirmedVersion via the updatePrompt store). Take-once so a re-render
  // can't double-install.
  useEffect(() => {
    const maybeInstall = () => {
      if (isUpdating) return;
      if (getConfirmedUpdate() === null) return;
      const version = takeConfirmedUpdate();
      if (version) void runInstall(version);
    };
    maybeInstall();
    return subscribePendingUpdate(maybeInstall);
  }, [isUpdating, runInstall]);

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
