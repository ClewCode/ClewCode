import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js';

type ClewProfile = 'coding' | 'personal';
const CLEW_PROFILES: readonly ClewProfile[] = ['coding', 'personal'];

const PROFILE_LABELS: Record<ClewProfile, string> = { coding: 'Clew Code', personal: 'Clew Personal' };
const PROFILE_DESCRIPTIONS: Record<ClewProfile, string> = {
  coding: 'implement software changes — inspect repo, edit files, run validation',
  personal: 'command center — plan, split tasks, delegate code work, summarize results',
};

type Props = { onDone: (result?: string) => void; context: any; args: string };

function ProfileCommand({ onDone, context, args }: Props): React.ReactNode {
  const appState = context.getAppState();
  const profile: ClewProfile = appState.profile;
  const lastModes = appState.lastProfileModes ?? {};
  const currentMode = appState.toolPermissionContext.mode;
  const trimmed = args?.trim().toLowerCase();

  useEffect(() => {
    if (trimmed === 'coding' || trimmed === 'personal') {
      const next = trimmed as ClewProfile;
      const updatedLastModes = { ...lastModes, [profile]: currentMode as PermissionMode };
      const restoredMode = updatedLastModes[next] ??
        (next === 'personal' ? ('ask' as const) : currentMode);
      context.setAppState((prev: any) => ({
        ...prev,
        profile: next,
        lastProfileModes: updatedLastModes,
        toolPermissionContext: { ...prev.toolPermissionContext, mode: restoredMode },
      }));
      updateSettingsForSource('userSettings', { profile: next });
      onDone(`Switched to ${PROFILE_LABELS[next]}.`);
    } else if (trimmed) {
      onDone(`Unknown profile: ${trimmed}. Available: ${CLEW_PROFILES.join(', ')}`);
    } else {
      onDone(`Active profile: ${PROFILE_LABELS[profile]} — ${PROFILE_DESCRIPTIONS[profile]}`);
    }
  }, []);

  return (
    <Box flexDirection="column">
      {trimmed === 'coding' || trimmed === 'personal' ? (
        <>
          <Text>Switched to <Text bold>{PROFILE_LABELS[trimmed as ClewProfile]}</Text>.</Text>
          <Text dimColor>{PROFILE_DESCRIPTIONS[trimmed as ClewProfile]}</Text>
        </>
      ) : trimmed ? (
        <>
          <Text color="red">Unknown profile: {trimmed}</Text>
          <Text>Available profiles: {CLEW_PROFILES.join(', ')}</Text>
        </>
      ) : (
        <>
          <Text>Active profile: <Text bold>{PROFILE_LABELS[profile]}</Text></Text>
          <Text dimColor>{PROFILE_DESCRIPTIONS[profile]}</Text>
          <Text dimColor>Switch with /profile coding or /profile personal</Text>
        </>
      )}
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  return <ProfileCommand onDone={onDone} context={context} args={args} />;
};
