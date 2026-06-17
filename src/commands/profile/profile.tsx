import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect } from 'react';
import type { LocalJSXCommandCall } from '../../types/command.js';
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

type ClewProfile = 'personal';
const CLEW_PROFILES: readonly ClewProfile[] = ['personal'];

const PROFILE_LABELS: Record<ClewProfile, string> = { personal: 'Clew Personal' };
const PROFILE_DESCRIPTIONS: Record<ClewProfile, string> = {
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
    if (trimmed === 'personal') {
      const updatedLastModes = { ...lastModes, [profile]: currentMode as PermissionMode };
      context.setAppState((prev: any) => ({
        ...prev,
        profile: 'personal' as const,
        lastProfileModes: updatedLastModes,
        toolPermissionContext: { ...prev.toolPermissionContext, mode: 'ask' },
      }));
      updateSettingsForSource('userSettings', { profile: 'personal' });
      onDone(`Switched to ${PROFILE_LABELS.personal}.`);
    } else if (trimmed) {
      onDone(`Unknown profile: "${trimmed}".`);
    } else {
      onDone(`Active profile: ${PROFILE_LABELS[profile]} — ${PROFILE_DESCRIPTIONS[profile]}`);
    }
  }, [profile, currentMode, trimmed, onDone, lastModes, context.setAppState]);

  return (
    <Box flexDirection="column">
      {trimmed === 'personal' ? (
        <>
          <Text>
            Switched to <Text bold>{PROFILE_LABELS.personal}</Text>.
          </Text>
          <Text dimColor>{PROFILE_DESCRIPTIONS.personal}</Text>
        </>
      ) : trimmed ? (
        <Text color="red">Unknown profile: "{trimmed}".</Text>
      ) : (
        <>
          <Text>
            Active profile: <Text bold>{PROFILE_LABELS[profile]}</Text>
          </Text>
          <Text dimColor>{PROFILE_DESCRIPTIONS[profile]}</Text>
        </>
      )}
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  return <ProfileCommand onDone={onDone} context={context} args={args} />;
};
