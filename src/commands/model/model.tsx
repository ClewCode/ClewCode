import chalk from 'chalk';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import type { EffortLevel } from '../../utils/effort.js';
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js';
import {
  clearFastModeCooldown,
  isFastModeAvailable,
  isFastModeEnabled,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js';
import { MODEL_ALIASES } from '../../utils/model/aliases.js';
import { checkOpus1mAccess, checkSonnet1mAccess } from '../../utils/model/check1mAccess.js';
import { fetchProviderModels, supportsModelFetching } from '../../utils/model/fetchProviderModels.js';
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel,
  renderModelName,
} from '../../utils/model/model.js';
import { isModelAllowed } from '../../utils/model/modelAllowlist.js';
import { addRecentModel } from '../../utils/model/recentModels.js';
import { validateModel } from '../../utils/model/validateModel.js';
import { setSessionModelForTranscript } from '../../utils/sessionStorage.js';

function ModelPickerWrapper({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const isFastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();

  function handleCancel(): void {
    logEvent('tengu_model_command_menu', {
      action: 'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    const displayModel = renderModelLabel(mainLoopModel);
    onDone(`Kept model as ${chalk.bold(displayModel)}`, {
      display: 'system',
    });
  }

  function handleSelect(
    model: string | null,
    effort: EffortLevel | undefined,
    options?: { persistAsDefault?: boolean },
  ): void {
    logEvent('tengu_model_command_menu', {
      action: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      from_model: mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    if (options?.persistAsDefault) {
      setAppState(prev => ({
        ...prev,
        mainLoopModel: model,
        mainLoopModelForSession: null,
      }));
      if (model !== null) {
        addRecentModel(model);
        try {
          const pm = ProviderManager.getInstance();
          const cfg = pm.getSelectedProviderConfig(true);
          if (cfg.model !== model) {
            pm.saveSelectedProviderConfig({ ...cfg, model });
          }
        } catch {
          // Non-critical: provider.json write is best-effort here.
        }
      }
    } else {
      setAppState(prev => ({
        ...prev,
        mainLoopModelForSession: model,
      }));
      if (model !== null) {
        addRecentModel(model);
      }
      // Persist the session model choice to transcript for resume restore
      setSessionModelForTranscript(model ?? undefined);
    }

    let message = options?.persistAsDefault
      ? `Set default model to ${chalk.bold(renderModelLabel(model))}`
      : `Set model to ${chalk.bold(renderModelLabel(model))} for this session`;
    if (effort !== undefined) {
      message += ` with ${chalk.bold(effort)} effort`;
    }

    // Turn off fast mode if switching to unsupported model
    let wasFastModeToggledOn;
    if (isFastModeEnabled()) {
      clearFastModeCooldown();
      if (!isFastModeSupportedByModel(model) && isFastMode) {
        setAppState(prev => ({
          ...prev,
          fastMode: false,
        }));
        wasFastModeToggledOn = false;
        // Do not update fast mode in settings since this is an automatic downgrade
      } else if (isFastModeSupportedByModel(model) && isFastModeAvailable() && isFastMode) {
        message += ` · Fast mode ON`;
        wasFastModeToggledOn = true;
      }
    }

    if (isBilledAsExtraUsage(model, wasFastModeToggledOn === true, isOpus1mMergeEnabled())) {
      message += ` · Billed as usage credits`;
    }

    if (wasFastModeToggledOn === false) {
      // Fast mode was toggled off, show suffix after extra usage billing
      message += ` · Fast mode OFF`;
    }

    onDone(message);
  }

  const activeModel = mainLoopModelForSession ?? mainLoopModel;

  return (
    <ModelPicker
      initial={activeModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onSetDefault={model => handleSelect(model, undefined, { persistAsDefault: true })}
      onCancel={handleCancel}
      isStandaloneCommand
      showFastModeNotice={
        isFastModeEnabled() && isFastMode && isFastModeSupportedByModel(mainLoopModel) && isFastModeAvailable()
      }
    />
  );
}

function SetModelAndClose({
  args,
  onDone,
}: {
  args: string;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const isFastMode = useAppState(s => s.fastMode);
  const setAppState = useSetAppState();
  const model = args === 'default' ? null : args;

  React.useEffect(() => {
    async function handleModelChange(): Promise<void> {
      if (model && !isModelAllowed(model)) {
        onDone(`Model '${model}' is not available. Your organization restricts model selection.`, {
          display: 'system',
        });
        return;
      }

      // @[MODEL LAUNCH]: Update check for 1M access.
      if (model && isOpus1mUnavailable(model)) {
        onDone(
          `Opus 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`,
          { display: 'system' },
        );
        return;
      }

      if (model && isSonnet1mUnavailable(model)) {
        onDone(
          `Sonnet 4.6 with 1M context is not available for your account. Learn more: https://code.claude.com/docs/en/model-config#extended-context-with-1m`,
          { display: 'system' },
        );
        return;
      }

      // Skip validation for default model
      if (!model) {
        setModel(null);
        return;
      }

      // Skip validation for known aliases - they're predefined and should work
      if (isKnownAlias(model)) {
        setModel(model);
        return;
      }

      // Validate and set custom model
      try {
        // Don't use parseUserSpecifiedModel for non-aliases since it lowercases the input
        // and model names are case-sensitive
        const { valid, error } = await validateModel(model);

        if (valid) {
          setModel(model);
        } else {
          onDone(error || `Model '${model}' not found`, {
            display: 'system',
          });
        }
      } catch (error) {
        onDone(`Failed to validate model: ${(error as Error).message}`, {
          display: 'system',
        });
      }
    }

    function setModel(modelValue: string | null): void {
      setAppState(prev => ({
        ...prev,
        mainLoopModelForSession: modelValue,
      }));

      if (modelValue !== null) {
        addRecentModel(modelValue);
      }

      // Persist the session model choice to transcript for resume restore
      setSessionModelForTranscript(modelValue ?? undefined);

      let message = `Set model to ${chalk.bold(renderModelLabel(modelValue))} for this session`;

      let wasFastModeToggledOn;
      if (isFastModeEnabled()) {
        clearFastModeCooldown();
        if (!isFastModeSupportedByModel(modelValue) && isFastMode) {
          setAppState(prev => ({
            ...prev,
            fastMode: false,
          }));
          wasFastModeToggledOn = false;
          // Do not update fast mode in settings since this is an automatic downgrade
        } else if (isFastModeSupportedByModel(modelValue) && isFastMode) {
          message += ` · Fast mode ON`;
          wasFastModeToggledOn = true;
        }
      }

      if (isBilledAsExtraUsage(modelValue, wasFastModeToggledOn === true, isOpus1mMergeEnabled())) {
        message += ` · Billed as extra usage`;
      }

      if (wasFastModeToggledOn === false) {
        // Fast mode was toggled off, show suffix after extra usage billing
        message += ` · Fast mode OFF`;
      }

      onDone(message);
    }

    void handleModelChange();
  }, [model, onDone, setAppState]);

  return null;
}

function isKnownAlias(model: string): boolean {
  return (MODEL_ALIASES as readonly string[]).includes(model.toLowerCase().trim());
}

function isOpus1mUnavailable(model: string): boolean {
  const m = model.toLowerCase();
  return !checkOpus1mAccess() && !isOpus1mMergeEnabled() && m.includes('opus') && m.includes('[1m]');
}

function isSonnet1mUnavailable(model: string): boolean {
  const m = model.toLowerCase();
  // Warn about Sonnet and Sonnet 4.6, but not Sonnet 4.5 since that had
  // a different access criteria.
  return !checkSonnet1mAccess() && (m.includes('sonnet[1m]') || m.includes('sonnet-4-6[1m]'));
}

function ShowModelAndClose({ onDone }: { onDone: (result?: string) => void }): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const effortValue = useAppState(s => s.effortValue);
  const displayModel = renderModelLabel(mainLoopModel);
  const effortInfo = effortValue !== undefined ? ` (effort: ${effortValue})` : '';

  if (mainLoopModelForSession) {
    onDone(
      `Current model: ${chalk.bold(renderModelLabel(mainLoopModelForSession))} (session override from plan mode)\nBase model: ${displayModel}${effortInfo}`,
    );
  } else {
    onDone(`Current model: ${displayModel}${effortInfo}`);
  }

  return null;
}

function ShowModelListAndClose({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  React.useEffect(() => {
    let cancelled = false;

    const loadModels = async (): Promise<void> => {
      try {
        const { ProviderManager } = await import('../../services/ai/ProviderManager.js');
        const { getProviderRegistryEntry } = await import('../../services/ai/providerRegistry.js');
        const { providersConfig } = await import('../../services/ai/ModelDiscoveryService.js');

        const pm = ProviderManager.getInstance();
        const providerId = pm.getActiveProviderName();
        const entry = getProviderRegistryEntry(providerId as any);
        const providerLabel = entry?.label ?? providerId;

        // Check if provider supports fetching models from API
        const { supportsModelFetching, fetchProviderModels } = await import('../../utils/model/fetchProviderModels.js');

        // Show a transient "loading…" status
        onDone(chalk.dim(`Fetching live model list from ${providerLabel} API…`));

        let lines: string[];
        if (!supportsModelFetching(providerId as any)) {
          // Fall back to static providers.json
          const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
          lines = buildStaticList(providerLabel, staticModels);
        } else {
          try {
            const fetched = await fetchProviderModels(providerId as any);
            if (cancelled) return;

            if (!fetched || fetched.length === 0) {
              // API returned nothing — show warning + static fallback
              const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
              lines = [
                chalk.yellow(`${providerLabel} /v1/models returned no results — check your API key and network.`),
                '',
                `${chalk.dim('Static fallback (providers.json)')}:`,
                ...buildStaticEntries(staticModels),
              ];
            } else {
              lines = [
                `${fetched.length} model${fetched.length !== 1 ? 's' : ''} available (${providerLabel}):`,
                '',
                ...buildFetchedEntries(fetched),
              ];
            }
          } catch (apiErr) {
            const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
            const errMsg = apiErr instanceof Error ? apiErr.message : 'Unknown error';
            lines = [
              chalk.red(`API fetch failed: ${errMsg}`),
              '',
              `${chalk.dim('Static fallback (providers.json)')}:`,
              ...buildStaticEntries(staticModels),
            ];
          }
        }

        if (!cancelled) {
          onDone(lines.join('\n'));
        }
      } catch (err) {
        if (cancelled) return;
        onDone(chalk.red(`Failed to list models: ${err instanceof Error ? err.message : 'Unknown error'}`));
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return null;
}

function buildStaticEntries(staticModels: any[]): string[] {
  const lines: string[] = [`${staticModels.length} model${staticModels.length !== 1 ? 's' : ''} available:`, ''];
  for (const m of staticModels) {
    const ctx = m.capabilities?.maxContext ? `${(m.capabilities.maxContext / 1000).toFixed(0)}K ctx` : '';
    const cw = m.capabilities?.maxOutput ? `${(m.capabilities.maxOutput / 1000).toFixed(0)}K out` : '';
    lines.push(`  ${(m.label || m.id).padEnd(50)}  ${m.id.padEnd(40)}  ${ctx}  ${cw}`);
  }
  return lines;
}

function buildStaticList(providerLabel: string, staticModels: any[]): string[] {
  return [
    `${staticModels.length} model${staticModels.length !== 1 ? 's' : ''} available (${providerLabel} — static):`,
    '',
    ...buildStaticEntries(staticModels),
  ];
}

function buildFetchedEntries(fetched: Array<{ id: string; label: string; contextWindow?: number }>): string[] {
  return fetched.map(m => {
    const ctx = m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}K ctx` : '';
    return `  ${m.label.padEnd(50)}  ${m.id.padEnd(40)}  ${ctx}`;
  });
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  // /model list — fetch live models from the active provider API
  if (args === 'list') {
    return <ShowModelListAndClose onDone={onDone} />;
  }

  if (COMMON_INFO_ARGS.includes(args)) {
    return <ShowModelAndClose onDone={onDone} />;
  }

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone('Run /model to open the model selection menu, or /model [modelName] to set the model.', {
      display: 'system',
    });
    return;
  }

  if (args) {
    logEvent('tengu_model_command_inline', {
      args: args as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return <SetModelAndClose args={args} onDone={onDone} />;
  }

  return <ModelPickerWrapper onDone={onDone} />;
};

function renderModelLabel(model: string | null): string {
  const effective = model ?? getDefaultMainLoopModelSetting();
  const rendered = renderModelName(parseUserSpecifiedModel(effective), undefined, 'short');
  return model === null ? `${rendered} (default)` : rendered;
}
