import ansis from 'ansis';
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
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js';
import type { EffortLevel } from '../../utils/effort.js';
import { stripSignatureBlocks } from '../../utils/messages.js';
import { MODEL_ALIASES } from '../../utils/model/aliases.js';
import { checkOpus1mAccess, checkSonnet1mAccess } from '../../utils/model/check1mAccess.js';
import {
  getDefaultMainLoopModelSetting,
  isOpus1mMergeEnabled,
  parseUserSpecifiedModel,
  renderModelName,
} from '../../utils/model/model.js';
import { isModelAllowed } from '../../utils/model/modelAllowlist.js';
import { applyProviderSwitch, providerDisplayName, resolveModelSelection } from '../../utils/model/providerSwitch.js';
import { addRecentModel } from '../../utils/model/recentModels.js';
import { validateModel } from '../../utils/model/validateModel.js';
import { setSessionModelForTranscript } from '../../utils/sessionStorage.js';

/**
 * Thinking-block signatures are bound to the model that produced them, so
 * replaying history written by the previous model 400s the moment the next
 * request goes out ("Invalid `signature` in `thinking` block"). Strip them on
 * every model change, exactly as /login does on a credential change.
 */
function stripStaleThinkingOnModelChange(setMessages: LocalJSXCommandContext['setMessages'] | undefined): void {
  setMessages?.(stripSignatureBlocks);
}

function ModelPickerWrapper({
  onDone,
  setMessages,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  setMessages?: LocalJSXCommandContext['setMessages'];
}): React.ReactNode {
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession);
  const setAppState = useSetAppState();

  function handleCancel(): void {
    logEvent('tengu_model_command_menu', {
      action: 'cancel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    const displayModel = renderModelLabel(mainLoopModel);
    onDone(`Kept model as ${ansis.bold(displayModel)}`, {
      display: 'system',
    });
  }

  function handleSelect(
    modelInput: string | null,
    effort: EffortLevel | undefined,
    options?: { persistAsDefault?: boolean },
  ): void {
    let model = modelInput;
    let targetProvider: string | undefined;

    if (modelInput) {
      const resolved = resolveModelSelection(modelInput);
      targetProvider = resolved.targetProvider;
      model = resolved.model;
    }

    logEvent('tengu_model_command_menu', {
      action: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      from_model: mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    const providerError = getProviderModelError(targetProvider, model);
    if (providerError) {
      onDone(providerError, { display: 'system' });
      return;
    }

    // Picking a model out of a provider's group switches to that provider —
    // otherwise the bare model id goes to whichever provider was already active.
    const providerPatch = applyProviderSwitch({
      targetProvider,
      model,
      persistAsDefault: options?.persistAsDefault === true,
    });

    if (options?.persistAsDefault) {
      setAppState(prev => ({
        ...prev,
        ...providerPatch,
        mainLoopModel: model,
        mainLoopModelForSession: null,
      }));
      if (model !== null) {
        addRecentModel(model);
        if (!targetProvider) {
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
      }
    } else {
      setAppState(prev => ({
        ...prev,
        ...providerPatch,
        mainLoopModelForSession: model,
      }));
      if (model !== null) {
        addRecentModel(model);
      }
      // Persist the session model choice to transcript for resume restore
      setSessionModelForTranscript(model ?? undefined);
    }

    stripStaleThinkingOnModelChange(setMessages);

    const providerLabel = providerPatch ? ` (${ansis.bold(providerDisplayName(targetProvider))})` : '';
    let message = options?.persistAsDefault
      ? `Set default model to ${ansis.bold(renderModelLabel(model))}${providerLabel}`
      : `Set model to ${ansis.bold(renderModelLabel(model))}${providerLabel} for this session`;
    if (effort !== undefined) {
      message += ` with ${ansis.bold(effort)} effort`;
    }

    onDone(message);
  }

  const activeModel = mainLoopModelForSession ?? mainLoopModel;

  return (
    <ModelPicker
      initial={activeModel}
      sessionModel={mainLoopModelForSession}
      onSelect={handleSelect}
      onSetDefault={(model: string | null, effort: EffortLevel | undefined) =>
        handleSelect(model, effort, { persistAsDefault: true })
      }
      onCancel={handleCancel}
      isStandaloneCommand
    />
  );
}

function SetModelAndClose({
  args,
  onDone,
  setMessages,
}: {
  args: string;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  setMessages?: LocalJSXCommandContext['setMessages'];
}): React.ReactNode {
  const setAppState = useSetAppState();

  const initialModel = args === 'default' ? null : args;
  let targetProvider: string | undefined;
  let model = initialModel;

  if (initialModel) {
    const resolved = resolveModelSelection(initialModel);
    targetProvider = resolved.targetProvider;
    model = resolved.model;
  }

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

      const providerError = getProviderModelError(targetProvider, model);
      if (providerError) {
        onDone(providerError, { display: 'system' });
        return;
      }

      // `/model <provider>/<model>` switches provider as well, and it has to
      // happen BEFORE validateModel — validation resolves against the ACTIVE
      // provider, so validating first would check the model against the
      // provider the user is leaving. Restored below if the model is rejected.
      const previousOverlay = ProviderManager.getInstance().getSessionProviderConfig();
      const providerPatch = applyProviderSwitch({ targetProvider, model, persistAsDefault: false });

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
          revertProviderSwitch();
          onDone(error || `Model '${model}' not found`, {
            display: 'system',
          });
        }
      } catch (error) {
        revertProviderSwitch();
        onDone(`Failed to validate model: ${(error as Error).message}`, {
          display: 'system',
        });
      }

      function revertProviderSwitch(): void {
        if (providerPatch) {
          ProviderManager.getInstance().setSessionProviderConfig(previousOverlay);
        }
      }

      function setModel(modelValue: string | null): void {
        // Session-only: AppState's mainLoopModelForSession (and, for a provider
        // switch, mainLoopProviderForSession) sync via onChangeAppState. Do NOT
        // call setSessionModel on the ProviderManager singleton — that leaks the
        // model override into every in-process session (agents, bg tasks).

        setAppState(prev => ({
          ...prev,
          ...providerPatch,
          mainLoopModelForSession: modelValue,
        }));

        if (modelValue !== null) {
          addRecentModel(modelValue);
        }

        // Persist the session model choice to transcript for resume restore
        setSessionModelForTranscript(modelValue ?? undefined);

        stripStaleThinkingOnModelChange(setMessages);

        const providerLabel = providerPatch ? ` (${ansis.bold(providerDisplayName(targetProvider))})` : '';
        const message = `Set model to ${ansis.bold(renderModelLabel(modelValue))}${providerLabel} for this session`;

        onDone(message);
      }
    }

    void handleModelChange();
  }, [model, onDone, setAppState, targetProvider, setMessages]);

  return null;
}

function getProviderModelError(targetProvider: string | undefined, model: string | null): string | null {
  if (!targetProvider || !model || targetProvider !== 'google-assist') {
    return null;
  }

  const { getProviderRegistryEntry } = require('../../services/ai/providerRegistry.js');
  const registryEntry = getProviderRegistryEntry(targetProvider as any);
  if (registryEntry.models.some((entry: { id: string }) => entry.id === model)) {
    return null;
  }

  return `Model '${model}' is not supported by Gemini Code Assist. Try '${registryEntry.defaultModel}' instead`;
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
      `Current model: ${ansis.bold(renderModelLabel(mainLoopModelForSession))} (session override from plan mode)\nBase model: ${displayModel}${effortInfo}`,
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
        onDone(ansis.dim(`Fetching live model list from ${providerLabel} API…`));

        let lines: string[];
        if (!supportsModelFetching(providerId as any)) {
          // Fall back to static providers.json
          const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
          lines = buildStaticList(providerLabel, staticModels);
        } else {
          try {
            // Race with a timeout so a hung API doesn't block the command forever
            const fetched = await Promise.race([
              fetchProviderModels(providerId as any),
              new Promise<null>(resolve => setTimeout(() => resolve(null), 15_000)),
            ]);
            if (cancelled) return;

            if (!fetched || fetched.length === 0) {
              // API returned nothing — show warning + static fallback
              const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
              lines = [
                ansis.yellow(`${providerLabel} /v1/models returned no results — check your API key and network.`),
                '',
                `${ansis.dim('Static fallback (providers.json)')}:`,
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
            if (cancelled) return;
            const staticModels = (providersConfig as any)?.[providerId]?.models ?? [];
            const errMsg = apiErr instanceof Error ? apiErr.message : 'Unknown error';
            lines = [
              ansis.red(`API fetch failed: ${errMsg}`),
              '',
              `${ansis.dim('Static fallback (providers.json)')}:`,
              ...buildStaticEntries(staticModels),
            ];
          }
        }

        if (!cancelled) {
          onDone(lines.join('\n'));
        }
      } catch (err) {
        if (cancelled) return;
        onDone(ansis.red(`Failed to list models: ${err instanceof Error ? err.message : 'Unknown error'}`));
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
    const caps = m.capabilities ?? {};
    const parts: string[] = [];
    if (caps.maxContext && caps.maxContext !== 'varies') {
      parts.push(`${(Number(caps.maxContext) / 1000).toFixed(0)}K ctx`);
    }
    if (caps.maxOutput && caps.maxOutput !== 'varies') {
      parts.push(`${(Number(caps.maxOutput) / 1000).toFixed(0)}K out`);
    }
    if (caps.vision) parts.push('vision');
    if (caps.toolCalling && caps.toolCalling !== 'none') parts.push('tools');
    if (caps.reasoning) parts.push('reason');
    if (m.tags?.includes('free')) parts.push('free');
    const info = parts.length > 0 ? ` [${parts.join(', ')}]` : '';
    lines.push(`  ${(m.label || m.id).padEnd(50)}  ${m.id.padEnd(40)}${info}`);
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

function buildFetchedEntries(
  fetched: Array<{
    id: string;
    label: string;
    contextWindow?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsReasoning?: boolean;
    free?: boolean;
  }>,
): string[] {
  return fetched.map(m => {
    const parts: string[] = [];
    if (m.contextWindow) parts.push(`${(m.contextWindow / 1000).toFixed(0)}K ctx`);
    if (m.supportsVision) parts.push('vision');
    if (m.supportsTools) parts.push('tools');
    if (m.supportsReasoning) parts.push('reason');
    if (m.free) parts.push('free');
    const capabilities = parts.length > 0 ? ` [${parts.join(', ')}]` : '';
    return `  ${m.label.padEnd(50)}  ${m.id.padEnd(40)}${capabilities}`;
  });
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  args = args?.trim() || '';
  const setMessages = context?.setMessages;

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
    return <SetModelAndClose args={args} onDone={onDone} setMessages={setMessages} />;
  }

  return <ModelPickerWrapper onDone={onDone} setMessages={setMessages} />;
};

function renderModelLabel(model: string | null): string {
  const effective = model ?? getDefaultMainLoopModelSetting();
  const rendered = renderModelName(parseUserSpecifiedModel(effective), undefined, 'short');
  return model === null ? `${rendered} (default)` : rendered;
}
