import React from 'react';
import { Box, Text } from 'ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js';

// ponytail: inline — Bun transpiler drops exports after a certain point in permissions.ts
type ClewProfile = 'coding' | 'personal';
const CLEW_PROFILES: readonly ClewProfile[] = ['coding', 'personal'];

const PROFILE_LABELS: Record<ClewProfile, string> = {
  coding: 'Coding',
  personal: 'Personal',
};

const PROFILE_DESCRIPTIONS: Record<ClewProfile, string> = {
  coding: 'implement software changes — inspect repo, edit files, run validation',
  personal: 'command center — plan, split tasks, delegate code work, summarize results',
};

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const appState = context.getAppState();
  const profile = appState.profile;
  const lastModes = appState.lastProfileModes;
  const currentMode = appState.toolPermissionContext.mode;

  const trimmed = args?.trim().toLowerCase();

  if (trimmed === 'coding' || trimmed === 'personal') {
    const next = trimmed as ClewProfile;
    const updatedLastModes = { ...lastModes, [profile]: currentMode as PermissionMode };
    const restoredMode = updatedLastModes[next] ??
      (next === 'personal' ? ('ask' as const) : currentMode);

    context.setAppState(prev => ({
      ...prev,
      profile: next,
      lastProfileModes: updatedLastModes,
      toolPermissionContext: { ...prev.toolPermissionContext, mode: restoredMode },
    }));
    updateSettingsForSource('userSettings', { profile: next });

    onDone(
      <Box flexDirection="column">
        <Text>Switched to <Text bold>{PROFILE_LABELS[next]}</Text> profile.</Text>
        <Text dimColor>{PROFILE_DESCRIPTIONS[next]}</Text>
      </Box>,
    );
    return;
  }

  if (trimmed) {
    onDone(
      <Box flexDirection="column">
        <Text color="red">Unknown profile: {trimmed}</Text>
        <Text>Available profiles: {CLEW_PROFILES.join(', ')}</Text>
      </Box>,
    );
    return;
  }

  onDone(
    <Box flexDirection="column">
      <Text>
        Active profile: <Text bold>{PROFILE_LABELS[profile]}</Text>
      </Text>
      <Text dimColor>{PROFILE_DESCRIPTIONS[profile]}</Text>
      <Text dimColor>Switch with /profile coding or /profile personal</Text>
    </Box>,
  );
};
