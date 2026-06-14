import React from 'react';
import { Box, Text } from 'ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
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

export const call: LocalJSXCommandCall = async (_onDone, _context, args) => {
  const profile = useAppState(s => s.profile);
  const lastModes = useAppState(s => s.lastProfileModes);
  const currentMode = useAppState(s => s.toolPermissionContext.mode);
  const setAppState = useSetAppState();

  const trimmed = args?.trim().toLowerCase();

  if (trimmed === 'coding' || trimmed === 'personal') {
    const next = trimmed as ClewProfile;
    // Save last mode for current profile before switching
    const updatedLastModes = { ...lastModes, [profile]: currentMode as PermissionMode };
    // Restore last mode for target profile (default: personal→ask, coding→keep current)
    const restoredMode = updatedLastModes[next] ??
      (next === 'personal' ? ('ask' as const) : currentMode);

    setAppState(prev => ({
      ...prev,
      profile: next,
      lastProfileModes: updatedLastModes,
      toolPermissionContext: { ...prev.toolPermissionContext, mode: restoredMode },
    }));
    // Persist across sessions
    updateSettingsForSource('userSettings', { profile: next });

    return (
      <Box flexDirection="column">
        <Text>Switched to <Text bold>{PROFILE_LABELS[next]}</Text> profile.</Text>
        <Text dimColor>{PROFILE_DESCRIPTIONS[next]}</Text>
      </Box>
    );
  }

  if (trimmed) {
    return (
      <Box flexDirection="column">
        <Text color="red">Unknown profile: {trimmed}</Text>
        <Text>Available profiles: {CLEW_PROFILES.join(', ')}</Text>
      </Box>
    );
  }

  // Show current profile
  return (
    <Box flexDirection="column">
      <Text>
        Active profile: <Text bold>{PROFILE_LABELS[profile]}</Text>
      </Text>
      <Text dimColor>{PROFILE_DESCRIPTIONS[profile]}</Text>
      <Text dimColor>Switch with /profile coding or /profile personal</Text>
    </Box>
  );
};
