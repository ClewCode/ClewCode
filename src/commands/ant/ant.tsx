import type React from 'react';
import { useState } from 'react';
import type { CommandResultDisplay, LocalJSXCommandContext } from '../../commands.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Box, Text } from '../../ink.js';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { ANT_BETA_LABELS, type AntBetaKey, getAntBetaStatus, setAntBetaSetting } from '../../utils/antBetas.js';
import { clearBetasCaches } from '../../utils/betas.js';

const ALL_KEYS: AntBetaKey[] = ['cliInternal', 'connectorText', 'tokenEfficientTools', 'numericEffort'];

type AntPickerProps = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

export function AntPicker({ onDone }: AntPickerProps): React.ReactNode {
  const initial = getAntBetaStatus();
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(initial.map(s => [s.key, s.enabled])),
  );
  const [focusIndex, setFocusIndex] = useState(0);

  function handleToggle(): void {
    const key = ALL_KEYS[focusIndex];
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleConfirm(): void {
    for (const key of ALL_KEYS) {
      const val = toggles[key];
      setAntBetaSetting(key, val);
    }
    clearBetasCaches();
    const enabled = ALL_KEYS.filter(k => toggles[k]);
    const label =
      enabled.length === 0 ? 'All ant betas disabled' : `Enabled: ${enabled.map(k => ANT_BETA_LABELS[k]).join(', ')}`;
    onDone(label, { display: 'system' });
  }

  function handleCancel(): void {
    onDone();
  }

  function handleFocusNext(): void {
    setFocusIndex(prev => (prev + 1) % ALL_KEYS.length);
  }

  function handleFocusPrev(): void {
    setFocusIndex(prev => (prev - 1 + ALL_KEYS.length) % ALL_KEYS.length);
  }

  useKeybindings(
    {
      'confirm:yes': handleConfirm,
      'confirm:nextField': handleToggle,
      'confirm:next': handleFocusNext,
      'confirm:previous': handleFocusPrev,
      'confirm:toggle': handleToggle,
    },
    { context: 'Confirmation' },
  );

  const enabledCount = ALL_KEYS.filter(k => toggles[k]).length;

  return (
    <Dialog
      title="Ant Beta Features"
      subtitle="Toggle ant-only beta features (may require Anthropic API backend support)"
      onCancel={handleCancel}
      color="professionalBlue"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Text>↑↓ to navigate · Space/Enter to toggle · Tab to confirm · Esc to cancel</Text>
        )
      }
    >
      <Box flexDirection="column" gap={0}>
        {ALL_KEYS.map((key, i) => {
          const isFocused = i === focusIndex;
          const enabled = toggles[key];
          return (
            <Box key={key} flexDirection="row" gap={2} marginLeft={2}>
              <Text bold={isFocused} color={isFocused ? 'professionalBlue' : undefined}>
                {isFocused ? '▸' : ' '}
              </Text>
              <Text bold color={enabled ? 'success' : 'error'}>
                [{enabled ? '✓' : ' '}]
              </Text>
              <Text bold={isFocused}>{key}</Text>
              <Text dimColor>— {ANT_BETA_LABELS[key]}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text dimColor>
          {enabledCount}/{ALL_KEYS.length} enabled
        </Text>
      </Box>
    </Dialog>
  );
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode | null> {
  const trimmed = args?.trim();
  const parts = trimmed ? trimmed.split(/\s+/) : [];

  // No args or only arg is "interactive" → show picker
  if (parts.length === 0) {
    return <AntPicker onDone={onDone} />;
  }

  // Non-interactive shortcuts (same as index.ts)
  if (parts.length === 1) {
    if (parts[0] === 'on') {
      const { setAllAntBetas } = await import('../../utils/antBetas.js');
      const { error } = setAllAntBetas(true);
      clearBetasCaches();
      if (error) {
        onDone(`Error: ${error.message}`);
        return null;
      }
      onDone('Enabled all ant beta features.');
      return null;
    }
    if (parts[0] === 'off') {
      const { setAllAntBetas } = await import('../../utils/antBetas.js');
      const { error } = setAllAntBetas(false);
      clearBetasCaches();
      if (error) {
        onDone(`Error: ${error.message}`);
        return null;
      }
      onDone('Disabled all ant beta features.');
      return null;
    }
  }

  if (parts.length === 2) {
    const [key, val] = [parts[0], parts[1].toLowerCase()];
    if (val !== 'on' && val !== 'off') {
      onDone(`Value must be 'on' or 'off', got '${val}'`);
      return null;
    }
    const { setAntBetaSetting: setBeta } = await import('../../utils/antBetas.js');
    const { error } = setBeta(key, val === 'on');
    clearBetasCaches();
    if (error) {
      onDone(`Error: ${error.message}`);
      return null;
    }
    const label = ANT_BETA_LABELS[key as keyof typeof ANT_BETA_LABELS] || key;
    onDone(`${label}: ${val === 'on' ? 'enabled' : 'disabled'}`);
    return null;
  }

  onDone('Too many arguments. Usage: /ant [on|off|<name> on|off]');
  return null;
}
