import ansis from 'ansis';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js';
import { Box, Text, useInput } from '../../ink.js';
import { PROVIDER_IDS, PROVIDER_REGISTRY } from '../../services/ai/providerRegistry.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { INTERNAL_PERMISSION_MODES } from '../../types/permissions.js';
import { parseUserSpecifiedModel, renderModelName } from '../../utils/model/model.js';
import { isModelAllowed } from '../../utils/model/modelAllowlist.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

// ── Helpers ────────────────────────────────────────────────

function renderSubagentModelLabel(model: string | null | undefined): string {
  if (!model) return 'Inherit from parent';
  if (model.includes('/')) return model;
  return renderModelName(parseUserSpecifiedModel(model), undefined, 'short');
}

function renderProviderLabel(provider: string | null | undefined): string {
  if (!provider || provider === 'inherit') return 'Inherit from parent';
  const entry = PROVIDER_REGISTRY[provider as keyof typeof PROVIDER_REGISTRY];
  return entry?.label ?? provider;
}

function renderPermissionLabel(mode: string | null | undefined): string {
  if (!mode || mode === 'inherit') return 'Inherit from parent';
  return mode;
}

function getPermissionModeDescription(mode: string): string {
  switch (mode) {
    case 'acceptEdits':
      return 'Auto-accept file edits, ask for other actions';
    case 'ask':
      return 'Always ask for permission';
    case 'bypassPermissions':
      return 'Bypass all permission checks (dangerous)';
    case 'default':
      return 'Use default permission behavior';
    case 'dontAsk':
      return 'Auto-accept all actions (dangerous)';
    case 'plan':
      return 'Plan mode — read-only with full context';
    case 'auto':
      return 'Smart automation with classifier-based decisions';
    case 'guardian':
      return 'Guardian mode — extra safety checks';
    default:
      return '';
  }
}

// ── Model Picker ───────────────────────────────────────────

/**
 * Parse a `providerId/modelId` string (ModelPicker format) into separate values.
 * If no '/' separator, the entire string is treated as a model ID (legacy).
 * Returns { model, provider } when a provider prefix is present,
 * or { model } when it's just a bare model name.
 */
function parseModelPickerFormat(value: string): { model: string; provider?: string } {
  const slashIdx = value.indexOf('/');
  if (slashIdx === -1) return { model: value };
  const prefix = value.slice(0, slashIdx);
  const suffix = value.slice(slashIdx + 1);
  // "providerId/modelId" — extract both
  if (suffix && suffix !== 'default') return { model: suffix, provider: prefix };
  // "providerId/default" — means "use provider's default"
  return { model: suffix || value, provider: prefix };
}

function ModelPickerWrapper({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const subagentModel = useAppState(s => s.settings.subagentModel ?? null);
  const subagentProvider = useAppState(s => s.settings.subagentProvider ?? null);
  const setAppState = useSetAppState();

  function handleCancel(): void {
    onDone(`Kept agent model as ${ansis.bold(renderSubagentModelLabel(subagentModel))}`, {
      display: 'system',
    });
  }

  function handleSelect(modelInput: string | null): void {
    if (!modelInput) {
      // User chose "Inherit from parent"
      const result = updateSettingsForSource('userSettings', {
        subagentModel: undefined,
        subagentProvider: undefined,
      });
      if (result.error) {
        onDone(`Failed to set agent model: ${result.error.message}`, { display: 'system' });
        return;
      }
      setAppState(prev => ({
        ...prev,
        settings: {
          ...prev.settings,
          subagentModel: undefined,
          subagentProvider: undefined,
        },
      }));
      onDone('Set agent model to inherit from parent');
      return;
    }

    // Parse providerId/modelId format
    const parsed = parseModelPickerFormat(modelInput);
    const updates: Record<string, string | undefined> = { subagentModel: parsed.model };

    // Also set provider if it came from a specific provider tab
    if (parsed.provider) {
      updates.subagentProvider = parsed.provider;
    }

    const result = updateSettingsForSource('userSettings', updates);
    if (result.error) {
      onDone(`Failed to set agent model: ${result.error.message}`, { display: 'system' });
      return;
    }

    setAppState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        subagentModel: parsed.model,
        subagentProvider: parsed.provider ?? prev.settings.subagentProvider,
      },
    }));
    onDone(
      `Set agent model to ${ansis.bold(parsed.model)}${parsed.provider ? ` (${ansis.dim(renderProviderLabel(parsed.provider))})` : ''}`,
    );
  }

  return (
    <ModelPicker
      initial={subagentModel}
      onSetDefault={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
      headerText="Choose the default model for Agent subagents."
      defaultOptionLabel="Inherit from parent"
      defaultOptionDescription="Use the parent conversation model for subagents"
    />
  );
}

// ── Provider Picker ────────────────────────────────────────

type ProviderOption = { value: string; label: string; description: string };

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: '__inherit__',
    label: 'Inherit from parent',
    description: 'Use the same provider as the parent conversation',
  },
  ...PROVIDER_IDS.map(id => {
    const entry = PROVIDER_REGISTRY[id as keyof typeof PROVIDER_REGISTRY];
    return {
      value: id,
      label: entry?.label ?? id,
      description: entry?.note ?? '',
    };
  }),
];

function ProviderPickerWrapper({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const subagentProvider = useAppState(s => s.settings.subagentProvider ?? null);
  const setAppState = useSetAppState();

  const initialIndex = React.useMemo(() => {
    if (!subagentProvider) return 0;
    const idx = PROVIDER_OPTIONS.findIndex(o => o.value === subagentProvider);
    return idx >= 0 ? idx : 0;
  }, [subagentProvider]);

  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex);
  const [confirmed, setConfirmed] = React.useState(false);

  useInput((input, key) => {
    if (confirmed) return;
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(PROVIDER_OPTIONS.length - 1, i + 1));
    } else if (key.return || input === ' ') {
      const choice = PROVIDER_OPTIONS[selectedIndex];
      if (!choice) return;
      setConfirmed(true);
      const value = choice.value === '__inherit__' ? null : choice.value;
      const result = updateSettingsForSource('userSettings', {
        subagentProvider: value ?? undefined,
      });
      if (result.error) {
        onDone(`Failed to set agent provider: ${result.error.message}`, { display: 'system' });
        return;
      }
      setAppState(prev => ({
        ...prev,
        settings: { ...prev.settings, subagentProvider: value ?? undefined },
      }));
      onDone(
        value
          ? `Set agent provider to ${ansis.bold(renderProviderLabel(value))}`
          : 'Set agent provider to inherit from parent',
      );
    } else if (input === 'q' || input === '\x1b' || key.escape) {
      onDone(`Kept agent provider as ${ansis.bold(renderProviderLabel(subagentProvider))}`, {
        display: 'system',
      });
    }
  });

  if (confirmed) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Select provider for Agent subagents</Text>
      <Box flexDirection="column" marginTop={1}>
        {PROVIDER_OPTIONS.map((opt, i) => (
          <Text key={opt.value} color={i === selectedIndex ? 'ansi:cyan' : undefined}>
            {i === selectedIndex ? '\u25b8 ' : '  '}
            {opt.label}
            {' \u2014 '}
            <Text dimColor>{opt.description}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'\u2191\u2193 navigate \u00b7 Enter select \u00b7 Esc cancel'}</Text>
      </Box>
    </Box>
  );
}

// ── Permission Mode Picker ──────────────────────────────────

const PERMISSION_OPTIONS: ProviderOption[] = [
  {
    value: '__inherit__',
    label: 'Inherit from parent',
    description: 'Use the same permission mode as the parent conversation',
  },
  ...INTERNAL_PERMISSION_MODES.map(mode => ({
    value: mode,
    label: mode,
    description: getPermissionModeDescription(mode),
  })),
];

function PermissionPickerWrapper({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const subagentPermissionMode = useAppState(s => s.settings.subagentPermissionMode ?? null);
  const setAppState = useSetAppState();

  const initialIndex = React.useMemo(() => {
    if (!subagentPermissionMode) return 0;
    const idx = PERMISSION_OPTIONS.findIndex(o => o.value === subagentPermissionMode);
    return idx >= 0 ? idx : 0;
  }, [subagentPermissionMode]);

  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex);
  const [confirmed, setConfirmed] = React.useState(false);

  useInput((input, key) => {
    if (confirmed) return;
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(PERMISSION_OPTIONS.length - 1, i + 1));
    } else if (key.return || input === ' ') {
      const choice = PERMISSION_OPTIONS[selectedIndex];
      if (!choice) return;
      setConfirmed(true);
      const value = choice.value === '__inherit__' ? null : choice.value;
      const result = updateSettingsForSource('userSettings', {
        subagentPermissionMode: value ?? undefined,
      });
      if (result.error) {
        onDone(`Failed to set agent permission mode: ${result.error.message}`, { display: 'system' });
        return;
      }
      setAppState(prev => ({
        ...prev,
        settings: { ...prev.settings, subagentPermissionMode: value ?? undefined },
      }));
      onDone(
        value
          ? `Set agent permission mode to ${ansis.bold(value)}`
          : 'Set agent permission mode to inherit from parent',
      );
    } else if (input === '\x1b' || key.escape) {
      onDone(`Kept agent permission mode as ${ansis.bold(renderPermissionLabel(subagentPermissionMode))}`, {
        display: 'system',
      });
    }
  });

  if (confirmed) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Select permission mode for Agent subagents</Text>
      <Box flexDirection="column" marginTop={1}>
        {PERMISSION_OPTIONS.map((opt, i) => (
          <Text key={opt.value} color={i === selectedIndex ? 'ansi:cyan' : undefined}>
            {i === selectedIndex ? '\u25b8 ' : '  '}
            {opt.label}
            {' \u2014 '}
            <Text dimColor>{opt.description}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'\u2191\u2193 navigate \u00b7 Enter/space select \u00b7 Esc cancel'}</Text>
      </Box>
    </Box>
  );
}

// ── Show Current Config ─────────────────────────────────────

function ShowCurrentConfig({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const settings = useAppState(s => s.settings);

  React.useEffect(() => {
    const lines = [
      'Current Agent subagent configuration:',
      `  Model:           ${ansis.bold(renderSubagentModelLabel(settings.subagentModel))}`,
      `  Provider:        ${ansis.bold(renderProviderLabel(settings.subagentProvider))}`,
      `  Permission mode: ${ansis.bold(renderPermissionLabel(settings.subagentPermissionMode))}`,
      '',
      ansis.dim('Use /agent-config to open the interactive pickers, or:'),
      ansis.dim('  /agent-config model <model>        Set model'),
      ansis.dim('  /agent-config provider <provider>   Set provider (or "inherit")'),
      ansis.dim('  /agent-config permission <mode>     Set permission mode (or "inherit")'),
      ansis.dim('  /agent-config all                   Open full configuration'),
      ansis.dim('  /agent-config default               Reset all to inherit from parent'),
    ];
    onDone(lines.join('\n'));
  }, [onDone, settings]);

  return null;
}

function ResetAll({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const result = updateSettingsForSource('userSettings', {
      subagentModel: undefined,
      subagentProvider: undefined,
      subagentPermissionMode: undefined,
    });
    if (result.error) {
      onDone(`Failed to reset agent config: ${result.error.message}`);
      return;
    }
    setAppState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        subagentModel: undefined,
        subagentProvider: undefined,
        subagentPermissionMode: undefined,
      },
    }));
    onDone('Agent subagent configuration reset to inherit all settings from parent');
  }, [onDone, setAppState]);

  return null;
}

// ── Model Set (non-interactive) ────────────────────────────

function SetModel({ args, onDone }: { args: string; onDone: (result: string) => void }): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const normalized = args.trim();
    const model = normalized === 'default' || normalized === 'inherit' || normalized === 'unset' ? null : normalized;

    if (model && !isModelAllowed(model)) {
      onDone(`Model '${model}' is not available. Your organization restricts model selection.`);
      return;
    }

    const result = updateSettingsForSource('userSettings', { subagentModel: model ?? undefined });
    if (result.error) {
      onDone(`Failed to set agent model: ${result.error.message}`);
      return;
    }

    setAppState(prev => ({ ...prev, settings: { ...prev.settings, subagentModel: model ?? undefined } }));

    onDone(
      model
        ? `Set agent model to ${ansis.bold(renderSubagentModelLabel(model))}`
        : 'Set agent model to inherit from parent',
    );
  }, [args, onDone, setAppState]);

  return null;
}

function SetProvider({ args, onDone }: { args: string; onDone: (result: string) => void }): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const normalized = args.trim();
    const provider = normalized === 'default' || normalized === 'inherit' || normalized === 'unset' ? null : normalized;

    if (provider && !PROVIDER_IDS.includes(provider as any)) {
      onDone(`Unknown provider '${provider}'. Use /providers list to see available providers.`);
      return;
    }

    const result = updateSettingsForSource('userSettings', { subagentProvider: provider ?? undefined });
    if (result.error) {
      onDone(`Failed to set agent provider: ${result.error.message}`);
      return;
    }

    setAppState(prev => ({ ...prev, settings: { ...prev.settings, subagentProvider: provider ?? undefined } }));

    onDone(
      provider
        ? `Set agent provider to ${ansis.bold(renderProviderLabel(provider))}`
        : 'Set agent provider to inherit from parent',
    );
  }, [args, onDone, setAppState]);

  return null;
}

function SetPermission({ args, onDone }: { args: string; onDone: (result: string) => void }): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const normalized = args.trim();
    const mode = normalized === 'default' || normalized === 'inherit' || normalized === 'unset' ? null : normalized;

    if (mode && !INTERNAL_PERMISSION_MODES.includes(mode as any)) {
      onDone(`Unknown permission mode '${mode}'. Valid modes: ${INTERNAL_PERMISSION_MODES.join(', ')}, inherit`);
      return;
    }

    const result = updateSettingsForSource('userSettings', { subagentPermissionMode: mode ?? undefined });
    if (result.error) {
      onDone(`Failed to set agent permission mode: ${result.error.message}`);
      return;
    }

    setAppState(prev => ({ ...prev, settings: { ...prev.settings, subagentPermissionMode: mode ?? undefined } }));

    onDone(
      mode ? `Set agent permission mode to ${ansis.bold(mode)}` : 'Set agent permission mode to inherit from parent',
    );
  }, [args, onDone, setAppState]);

  return null;
}

// ── Main entrypoint ─────────────────────────────────────────

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  // /agent-config show — display current config
  if (COMMON_INFO_ARGS.includes(args) || args === 'show') {
    return <ShowCurrentConfig onDone={onDone} />;
  }

  // /agent-config help
  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      [
        '/agent-config \u2014 Configure Agent subagent defaults',
        '',
        'Usage:',
        '  /agent-config                    Open interactive config (model picker)',
        '  /agent-config all                Open full interactive picker (model, provider, permission)',
        '  /agent-config show               Show current configuration',
        '  /agent-config model <model>      Set default model for subagents',
        '  /agent-config provider <p>       Set default provider (or "inherit")',
        '  /agent-config permission <mode>  Set default permission mode (or "inherit")',
        '  /agent-config default            Reset all to inherit from parent',
      ].join('\n'),
      { display: 'system' },
    );
    return;
  }

  // /agent-config default — reset all
  if (args === 'default') {
    return <ResetAll onDone={onDone} />;
  }

  // Parse subcommands: /agent-config <subcommand> <value>
  const subMatch = args.match(/^(\S+)\s+(.+)$/);
  if (subMatch) {
    const subcommand = subMatch[1]!.toLowerCase();
    const value = subMatch[2]!.trim();

    switch (subcommand) {
      case 'model':
        return <SetModel args={value} onDone={onDone} />;
      case 'provider':
        return <SetProvider args={value} onDone={onDone} />;
      case 'permission':
      case 'perm':
        return <SetPermission args={value} onDone={onDone} />;
      default:
        onDone(`Unknown subcommand '${subcommand}'. Use /agent-config help for usage.`, { display: 'system' });
        return;
    }
  }

  // No args — open interactive model picker (most common use case)
  // TODO: multi-step wizard for model + provider + permission
  return <ModelPickerWrapper onDone={onDone} />;
};
