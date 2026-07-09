import ansis from 'ansis';
import capitalize from 'lodash-es/capitalize.js';
import type * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { c as _c } from 'react/compiler-runtime';
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js';
import { useSearchInput } from 'src/hooks/useSearchInput.js';
import { ProviderManager } from 'src/services/ai/ProviderManager.js';
import {
  getProviderRegistryEntry,
  PROVIDER_IDS,
  PROVIDER_REGISTRY,
  type ProviderModelInfo,
} from 'src/services/ai/providerRegistry.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { Box, Text, useInput, useTerminalFocus } from '../ink.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js';
import { type FetchedModel, fetchProviderModels, supportsModelFetching } from '../utils/model/fetchProviderModels.js';
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js';
import { mergeRecentModels } from '../utils/model/recentModels.js';
import { getSettingsForSource, updateSettingsForSource } from '../utils/settings/settings.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Select } from './CustomSelect/index.js';
import { Byline } from './design-system/Byline.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Pane } from './design-system/Pane.js';
import { effortLevelToSymbol } from './EffortIndicator.js';
import { SearchBox } from './SearchBox.js';
export type Props = {
  initial: string | null;
  sessionModel?: ModelSetting;
  /** Press `s` in the picker to use the focused model for this session only. */
  onSelect?: (model: string | null, effort: EffortLevel | undefined) => void;
  /** Press Enter to persist the focused model as the default for new sessions. Falls back to onSelect if not provided. */
  onSetDefault?: (model: string | null, effort: EffortLevel | undefined) => void;
  onCancel?: () => void;
  isStandaloneCommand?: boolean;
  /** Overrides the dim header line below "Select model". */
  headerText?: string;
  /**
   * When true, skip writing effortLevel to userSettings on selection.
   * Used by the assistant installer wizard where the model choice is
   * project-scoped (written to the assistant's .clew/settings.json via
   * install.ts) and should not leak to the user's global ~/.clew/settings.
   */
  skipSettingsWrite?: boolean;
  defaultOptionLabel?: string;
  defaultOptionDescription?: string;
};
const NO_PREFERENCE = '__NO_PREFERENCE__';
export function ModelPicker(t0) {
  const $ = _c(82);
  const {
    initial,
    sessionModel,
    onSelect,
    onSetDefault,
    onCancel,
    isStandaloneCommand,
    headerText,
    skipSettingsWrite,
    defaultOptionLabel,
    defaultOptionDescription,
  } = t0;
  const setAppState = useSetAppState();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const initialValue = initial === null ? NO_PREFERENCE : initial;
  const [focusedValue, setFocusedValue] = useState(initialValue);
  const fetchedModelsData = useAppState(
    (s: { fetchedModels?: { provider: string; models: FetchedModel[]; fetchedAt: number } }) => s.fetchedModels,
  );
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [hasToggledEffort, setHasToggledEffort] = useState(false);
  const effortValue = useAppState(_temp2);
  let t1;
  if ($[0] !== effortValue) {
    t1 = effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined;
    $[0] = effortValue;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [effort, setEffort] = useState(t1);
  const [customModelId, setCustomModelId] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(true);
  const { query: searchQuery, cursorOffset: searchCursorOffset } = useSearchInput({
    isActive: isSearchActive,
    onExit: () => setIsSearchActive(false),
    backspaceExitsOnEmpty: false,
  });
  const selectableProviderIds = useMemo(() => getSelectableProviderIds(), []);
  const [activeProviderId, setActiveProviderId] = useState(() => {
    const current = ProviderManager.getInstance().getActiveProviderName();
    return selectableProviderIds.includes(current as any) ? current : (selectableProviderIds[0] ?? current);
  });

  const providerInfo = useMemo(() => {
    const entry = getProviderRegistryEntry(activeProviderId as any);
    if (!entry) return null;
    return {
      entry,
      selectedModel: ProviderManager.getInstance().getModelForProvider(activeProviderId as any),
      providerId: activeProviderId,
    };
  }, [activeProviderId]);

  // Fetch models from provider on mount
  useEffect(() => {
    const loadModels = async () => {
      if (!providerInfo) return;

      // Check if we already have fresh fetched models for this provider
      const currentFetched = fetchedModelsData as { provider?: string; models?: FetchedModel[] } | undefined;
      if (currentFetched?.provider === providerInfo.providerId) {
        // Models already fetched for this provider
        return;
      }

      if (!supportsModelFetching(providerInfo.providerId as any)) {
        return;
      }

      setIsFetchingModels(true);
      try {
        const models = await fetchProviderModels(providerInfo.providerId as any);
        if (models && models.length > 0) {
          setAppState(prev => ({
            ...prev,
            fetchedModels: {
              provider: providerInfo.providerId,
              models,
              fetchedAt: Date.now(),
            },
          }));
        }
      } finally {
        setIsFetchingModels(false);
      }
    };

    loadModels();
  }, [setAppState, fetchedModelsData, providerInfo?.providerId, providerInfo]);

  // Get fetched models for current provider
  const currentFetchedModels = useMemo(() => {
    const data = fetchedModelsData as { provider?: string; models?: FetchedModel[] } | undefined;
    if (!data || data.provider !== providerInfo?.providerId) {
      return null;
    }
    return data.models ?? null;
  }, [fetchedModelsData, providerInfo?.providerId]);

  // Compute model options with fetched models
  const modelOptions = useMemo(() => {
    return getEffectiveModelOptions(
      currentFetchedModels,
      providerInfo?.entry,
      initial,
      activeProviderId,
      defaultOptionLabel,
      defaultOptionDescription,
    );
  }, [currentFetchedModels, providerInfo?.entry, initial, activeProviderId, defaultOptionLabel, defaultOptionDescription]);
  let t4;
  bb0: {
    if (initial !== null && !modelOptions.some(opt => opt.value === initial)) {
      let t5;
      if ($[4] !== initial) {
        t5 = modelDisplayString(initial);
        $[4] = initial;
        $[5] = t5;
      } else {
        t5 = $[5];
      }
      let t6;
      if ($[6] !== initial || $[7] !== t5) {
        t6 = {
          value: initial,
          label: t5,
          description: 'Current model',
        };
        $[6] = initial;
        $[7] = t5;
        $[8] = t6;
      } else {
        t6 = $[8];
      }
      let t7;
      if ($[9] !== modelOptions || $[10] !== t6) {
        t7 = [...modelOptions, t6];
        $[9] = modelOptions;
        $[10] = t6;
        $[11] = t7;
      } else {
        t7 = $[11];
      }
      t4 = t7;
      break bb0;
    }
    t4 = modelOptions;
  }
  const optionsWithInitial = t4;
  let t5;
  if ($[12] !== optionsWithInitial) {
    t5 = optionsWithInitial.map(_temp3);
    $[12] = optionsWithInitial;
    $[13] = t5;
  } else {
    t5 = $[13];
  }
  const selectOptions = t5;
  const filteredSelectOptions = useMemo(
    () => filterModelOptions(selectOptions, searchQuery),
    [selectOptions, searchQuery],
  );
  const totalModelCount = countRealModelOptions(selectOptions);
  const matchedModelCount = countRealModelOptions(filteredSelectOptions);
  let t6;
  if ($[14] !== initialValue || $[15] !== filteredSelectOptions || $[1] !== searchQuery) {
    // If searching, focus the first result. Otherwise, prefer the current model (initialValue).
    t6 = searchQuery
      ? filteredSelectOptions[0]?.value
      : filteredSelectOptions.some(_ => _.value === initialValue)
        ? initialValue
        : (filteredSelectOptions[0]?.value ?? undefined);
    $[14] = initialValue;
    $[15] = filteredSelectOptions;
    $[1] = searchQuery;
    $[16] = t6;
  } else {
    t6 = $[16];
  }
  const initialFocusValue = t6;
  const visibleCount = Math.min(10, filteredSelectOptions.length);
  const hiddenCount = Math.max(0, filteredSelectOptions.length - visibleCount);
  let t7;
  const effectiveFocusedValue = filteredSelectOptions.some(opt => opt.value === focusedValue)
    ? focusedValue
    : initialFocusValue;
  if ($[17] !== effectiveFocusedValue || $[18] !== filteredSelectOptions) {
    t7 = filteredSelectOptions.find(opt_1 => opt_1.value === effectiveFocusedValue)?.label;
    $[17] = effectiveFocusedValue;
    $[18] = filteredSelectOptions;
    $[19] = t7;
  } else {
    t7 = $[19];
  }
  const focusedModelName = t7;
  const focusedModel = resolveOptionModel(effectiveFocusedValue, activeProviderId);
  const focusedSupportsEffort = focusedModel ? modelSupportsEffort(focusedModel) : false;
  const focusedSupportsMax = focusedModel ? modelSupportsMaxEffort(focusedModel) : false;
  const focusedDefaultEffort = getDefaultEffortLevelForOption(effectiveFocusedValue, activeProviderId);
  const displayEffort = effort === 'max' && !focusedSupportsMax ? 'high' : effort;
  const handleFocus = (value: string) => {
    setFocusedValue(value);
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value, activeProviderId));
    }
  };
  let t11;
  if ($[28] !== focusedDefaultEffort || $[29] !== focusedSupportsEffort || $[30] !== focusedSupportsMax) {
    t11 = direction => {
      if (!focusedSupportsEffort) {
        return;
      }
      setEffort(prev => cycleEffortLevel(prev ?? focusedDefaultEffort, direction, focusedSupportsMax));
      setHasToggledEffort(true);
    };
    $[28] = focusedDefaultEffort;
    $[29] = focusedSupportsEffort;
    $[30] = focusedSupportsMax;
    $[31] = t11;
  } else {
    t11 = $[31];
  }
  const handleCycleEffort = t11;
  // Search is now focused by default, no need for / trigger.
  // We keep a small useInput to re-focus search if the user starts typing while in the list.
  useInput(
    (input, key) => {
      if (showCustomInput) {
        if (key.escape) {
          setShowCustomInput(false);
          setIsSearchActive(true);
          return;
        }
        if (key.return) {
          if (customModelId.trim()) {
            onSelect?.(formatProviderModelSetting(activeProviderId, customModelId.trim()), effort);
          }
          return;
        }
        if (key.backspace) {
          setCustomModelId(prev => prev.slice(0, -1));
          return;
        }
        if (input.length === 1 && !key.ctrl && !key.meta) {
          setCustomModelId(prev => prev + input);
        }
        return;
      }

      if (key.tab) {
        if (selectableProviderIds.length > 1) {
          setActiveProviderId(prev => {
            const currentIndex = selectableProviderIds.indexOf(prev as any);
            const safeIndex = currentIndex === -1 ? 0 : currentIndex;
            const direction = key.shift ? -1 : 1;
            const nextIndex = (safeIndex + direction + selectableProviderIds.length) % selectableProviderIds.length;
            return selectableProviderIds[nextIndex] ?? prev;
          });
          setFocusedValue(NO_PREFERENCE);
          setIsSearchActive(true);
        }
        return;
      }

      if (
        !isSearchActive &&
        input.length === 1 &&
        !key.ctrl &&
        !key.meta &&
        !key.return &&
        !key.tab &&
        !key.backspace &&
        !key.delete
      ) {
        setIsSearchActive(true);
      }

      if (
        !isSearchActive &&
        isStandaloneCommand &&
        onSelect &&
        (input === 's' || input === 'S') &&
        !key.ctrl &&
        !key.meta
      ) {
        const modelValue = resolveOptionModel(effectiveFocusedValue, activeProviderId);
        const selectedEffort = hasToggledEffort && modelValue && modelSupportsEffort(modelValue) ? effort : undefined;
        const selectedValue =
          effectiveFocusedValue === NO_PREFERENCE
            ? `${activeProviderId}/default`
            : effectiveFocusedValue
              ? formatProviderModelSetting(activeProviderId, effectiveFocusedValue)
              : null;
        onSelect(selectedValue, selectedEffort);
      }
    },
    {
      isActive: true,
    },
  );
  let t12;
  if ($[32] !== handleCycleEffort) {
    t12 = {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    };
    $[32] = handleCycleEffort;
    $[33] = t12;
  } else {
    t12 = $[33];
  }
  let t13;
  if ($[34] === Symbol.for('react.memo_cache_sentinel')) {
    t13 = {
      context: 'ModelPicker',
    };
    $[34] = t13;
  } else {
    t13 = $[34];
  }
  useKeybindings(t12, t13);
  let t14;
  if (
    $[35] !== effort ||
    $[36] !== hasToggledEffort ||
    $[37] !== onSetDefault ||
    $[38] !== onSelect ||
    $[39] !== setAppState ||
    $[40] !== skipSettingsWrite ||
    $[41] !== activeProviderId
  ) {
    t14 = function handleSelect(value_0) {
      if (value_0 === '__CUSTOM_INPUT__') {
        setShowCustomInput(true);
        setIsSearchActive(false); // Deactivate model search to focus on custom input
        return;
      }

      logEvent('tengu_model_command_menu_effort', {
        effort: effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      if (!skipSettingsWrite) {
        const effortLevel = resolvePickerEffortPersistence(
          effort,
          getDefaultEffortLevelForOption(value_0, activeProviderId),
          getSettingsForSource('userSettings')?.effortLevel,
          hasToggledEffort,
        );
        const persistable = toPersistableEffort(effortLevel);
        if (persistable !== undefined) {
          updateSettingsForSource('userSettings', {
            effortLevel: persistable,
          });
        }
        setAppState(prev_0 => ({
          ...prev_0,
          effortValue: effortLevel,
        }));
      }
      const selectedModel = resolveOptionModel(value_0, activeProviderId);
      const selectedEffort =
        hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel) ? effort : undefined;
      const handler = onSetDefault ?? onSelect;
      if (handler) {
        if (value_0 === NO_PREFERENCE) {
          handler(`${activeProviderId}/default`, selectedEffort);
          return;
        }
        handler(formatProviderModelSetting(activeProviderId, value_0), selectedEffort);
      }
    };
    $[35] = effort;
    $[36] = hasToggledEffort;
    $[37] = onSetDefault;
    $[38] = onSelect;
    $[39] = setAppState;
    $[40] = skipSettingsWrite;
    $[41] = activeProviderId;
    $[42] = t14;
  } else {
    t14 = $[42];
  }
  const handleSelect = t14;
  const baseHeaderText = headerText ?? getDefaultHeaderText(providerInfo);
  const displayHeaderText = isFetchingModels ? `${baseHeaderText} (fetching models...)` : baseHeaderText;
  const t20 = onCancel ?? _temp4;

  if (showCustomInput) {
    return (
      <Pane color="permission">
        <Box flexDirection="column" padding={1}>
          <Text color="remember" bold={true}>
            Enter Custom Model ID
          </Text>
          <Text dimColor={true}>Type the exact ID of the model you want to use (e.g. claude-3-5-sonnet-20240620)</Text>
          <Box marginTop={1} borderStyle="round" paddingX={1}>
            <SearchBox
              query={customModelId}
              cursorOffset={customModelId.length}
              placeholder="Model ID..."
              isFocused={true}
              isTerminalFocused={true}
            />
          </Box>
          <Text dimColor={true} italic={true}>
            Press {ansis.bold('Enter')} to confirm or {ansis.bold('Esc')} to go back
          </Text>
        </Box>
      </Pane>
    );
  }

  const content = (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold={true}>
            Select model
          </Text>
          <Text dimColor={true}>{displayHeaderText}</Text>
          {sessionModel && (
            <Text dimColor={true}>
              Currently using {modelDisplayString(sessionModel)} for this session (set by plan mode). Selecting a model
              will undo this.
            </Text>
          )}
          <ProviderTabs
            providerIds={selectableProviderIds}
            activeProviderId={activeProviderId}
            modelCount={totalModelCount}
            matchedModelCount={matchedModelCount}
            isFiltering={Boolean(searchQuery.trim())}
          />
        </Box>
        <ModelSearchBar
          isActive={isSearchActive}
          query={searchQuery}
          cursorOffset={searchCursorOffset}
          matchCount={matchedModelCount}
          totalCount={totalModelCount}
        />
        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="column">
            {filteredSelectOptions.length > 0 ? (
              <Select
                isDisabled={isSearchActive}
                defaultValue={initialValue}
                defaultFocusValue={initialFocusValue}
                options={filteredSelectOptions}
                onChange={handleSelect}
                onFocus={handleFocus}
                onCancel={t20}
                visibleOptionCount={visibleCount}
                highlightText={searchQuery}
              />
            ) : (
              <Box paddingLeft={3}>
                <Text color="error">No matching models</Text>
              </Box>
            )}
          </Box>
          {hiddenCount > 0 && (
            <Box paddingLeft={3}>
              <Text dimColor={true}>and {hiddenCount} more…</Text>
            </Box>
          )}
        </Box>
        <Box marginBottom={1} flexDirection="column">
          {focusedSupportsEffort ? (
            <Text dimColor={true}>
              <EffortLevelIndicator effort={displayEffort} /> {capitalize(displayEffort)} effort
              {displayEffort === focusedDefaultEffort ? ' (default)' : ''} <Text color="subtle">← → to adjust</Text>
            </Text>
          ) : (
            <Text color="subtle">
              <EffortLevelIndicator effort={undefined} /> Effort not supported
              {focusedModelName ? ` for ${focusedModelName}` : ''}
            </Text>
          )}
        </Box>
      </Box>
      {isStandaloneCommand && (
        <Text dimColor={true} italic={true}>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              {onSelect && <KeyboardShortcutHint shortcut="s" action="use for this session only" />}
              <ConfigurableShortcutHint action="select:cancel" context="Select" fallback="Esc" description="exit" />
            </Byline>
          )}
        </Text>
      )}
    </Box>
  );
  if (!isStandaloneCommand) {
    return content;
  }
  return <Pane color="permission">{content}</Pane>;
}
function _temp4() {}
function _temp3(opt_0) {
  return {
    ...opt_0,
    value: opt_0.value === null ? NO_PREFERENCE : opt_0.value,
  };
}
function _temp2(s_0) {
  return s_0.effortValue;
}
function _temp(_s) {
  return false;
}
function getDefaultHeaderText(
  providerInfo?: {
    entry: ReturnType<typeof getProviderRegistryEntry>;
    selectedModel: string | undefined;
    providerId: string;
  } | null,
): string {
  const info = providerInfo ?? getActiveProviderInfo();
  if (!info) {
    return 'Switch between models. Applies to this session.';
  }
  return `Switch to ${info.entry.label} model. Press Tab to change provider.`;
}

function getActiveProviderInfo(): {
  entry: ReturnType<typeof getProviderRegistryEntry>;
  selectedModel: string | undefined;
  providerId: string;
} | null {
  const providerManager = ProviderManager.getInstance();
  const providerId = providerManager.getActiveProviderName();
  const entry = getProviderRegistryEntry(providerId);
  if (!entry) return null;

  return {
    entry,
    selectedModel: providerManager.getModelForProvider(providerId),
    providerId,
  };
}

function getEffectiveModelOptions(
  fetchedModels?: FetchedModel[] | null,
  entry?: ReturnType<typeof getProviderRegistryEntry>,
  initial?: string | null,
  activeProviderId?: string,
  defaultOptionLabel?: string,
  defaultOptionDescription?: string,
): ModelOption[] {
  const providerManager = ProviderManager.getInstance();
  const currentProviderId = activeProviderId ?? providerManager.getActiveProviderName();
  const providerEntry = entry ?? getProviderRegistryEntry(currentProviderId as any);

  // When no provider registry entry found, return minimal options instead of
  // falling back to hardcoded Claude models (getModelOptions()). Show the
  // default option and a custom model input so users can type any model ID.
  if (!providerEntry) {
    const defaultModel = providerManager.getModelForProvider(currentProviderId as any) ?? 'custom';
    return [
      {
        value: null,
        label: defaultOptionLabel ?? 'Default (recommended)',
        description: defaultOptionDescription ?? `Use current default (${defaultModel})`,
      },
      {
        value: '__CUSTOM_INPUT__',
        label: '✏️  Type custom model ID',
        description: 'Use: /model your-model-id',
      },
    ] as any;
  }

  const implementationType = providerManager.getImplementationType();

  // Merge API-fetched models with static providers.json models.
  // Fetched models are preferred (they're the live source of truth), but
  // static models backfill any gaps — some provider APIs return partial lists
  // or are temporarily unreachable.
  const staticModels: ModelOption[] = (providerEntry.models ?? [])
    .filter(m => !m.supportedTypes || m.supportedTypes.includes(implementationType))
    .map(m => toProviderModelOption(m));
  let providerModels: ModelOption[];
  if (fetchedModels && fetchedModels.length > 0) {
    // Map fetched models to ModelOption format
    providerModels = fetchedModels.map(m => {
      const parts: string[] = [];
      if (m.contextWindow) parts.push(`${formatContext(m.contextWindow)} ctx`);
      if (m.supportsVision) parts.push('vision');
      if (m.supportsTools) parts.push('tools');
      if (m.supportsReasoning) parts.push('reasoning');
      if (m.free) parts.push('free');
      if (m.maxOutput) parts.push(`${formatContext(m.maxOutput)} out`);
      return {
        value: m.id,
        label: m.label,
        description: parts.length > 0 ? parts.join(' · ') : (m.description ?? m.id),
        descriptionForModel: m.id,
      };
    });
    // Backfill any static models not returned by the API
    const fetchedIds = new Set(providerModels.map(m => m.value));
    for (const sm of staticModels) {
      if (!fetchedIds.has(sm.value)) {
        providerModels.push(sm);
      }
    }
  } else {
    providerModels = staticModels;
  }

  const defaultModel =
    providerManager.getModelForProvider(currentProviderId as any) ?? providerEntry.defaultModel ?? 'provider default';
  const defaultModelOption: ModelOption = {
    value: null,
    label: defaultOptionLabel ?? 'Default (recommended)',
    description: defaultOptionDescription ?? `Use ${providerEntry.label} default (${defaultModel})`,
  };

  // Keep recents, but only show recents that belong to the active provider list.
  const providerModelIds = new Set(providerModels.map(model => model.value));
  const recentModels = mergeRecentModels([
    initial,
    providerManager.getModelForProvider(currentProviderId as any),
  ]).filter((id): id is string => Boolean(id && providerModelIds.has(id)));

  const options: ModelOption[] = [];

  if (recentModels.length > 0) {
    options.push({
      value: '__SECTION_RECENT__',
      label: 'Recent',
      description: '',
      type: 'section',
      disabled: true,
    });
    for (const id of recentModels) {
      const found = providerModels.find(model => model.value === id);
      options.push({
        value: id,
        label: found?.label ?? id,
        description: 'Recently used',
        descriptionForModel: found?.descriptionForModel ?? id,
        hideIndex: true,
      });
    }
  }

  options.push(defaultModelOption);

  const recentModelSet = new Set(recentModels);
  const sectionModels = providerModels.filter(model => !recentModelSet.has(model.value));
  if (sectionModels.length > 0) {
    options.push({
      value: `__SECTION_${currentProviderId}__`,
      label: providerEntry.label,
      description: '',
      type: 'section',
      disabled: true,
    });
    options.push(...sectionModels);
  }

  options.push({
    value: '__CUSTOM_INPUT__',
    label: '✏️  Type custom model ID',
    description: 'Use: /model your-model-id',
  });

  return options as any;
}
function toProviderModelOption(model: ProviderModelInfo) {
  const label = model.label ?? model.id;
  const parts: string[] = [];
  const cap = model.capabilities;

  // Context window
  if (cap.maxContext) {
    const ctx = typeof cap.maxContext === 'number' ? formatContext(cap.maxContext) : 'varies';
    parts.push(`${ctx} ctx`);
  }
  // Vision
  if (cap.vision) parts.push('vision');
  // Tool calling
  if (cap.toolCalling && cap.toolCalling !== 'none') parts.push('tools');
  // Reasoning
  if (cap.reasoning) parts.push('reasoning');
  // Free
  if (cap.free) parts.push('free');

  const description = parts.length > 0 ? parts.join(' · ') : model.tags?.slice(0, 3).join(' · ') || model.id;

  return {
    value: model.id,
    label,
    description,
    descriptionForModel: model.id,
  };
}

function formatContext(ctx: number): string {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return String(ctx);
}

type ModelSelectOption = {
  value: string;
  label: React.ReactNode;
  description?: string;
  descriptionForModel?: string;
  type?: 'text' | 'section';
  disabled?: boolean;
  hideIndex?: boolean;
};

type ModelOption = {
  value: ModelSetting;
  label: string;
  description: string;
  descriptionForModel?: string;
  type?: 'text' | 'section';
  disabled?: boolean;
  hideIndex?: boolean;
};

function countRealModelOptions(options: ModelSelectOption[]): number {
  return options.filter(option => isRealModelOption(option)).length;
}

function isRealModelOption(option: ModelSelectOption): boolean {
  if (option.type === 'section') return false;
  if (!option.value) return false;
  if (option.value === NO_PREFERENCE) return false;
  if (option.value === '__CUSTOM_INPUT__') return false;
  return !option.value.startsWith('__SECTION_');
}

function filterModelOptions(options: ModelSelectOption[], query: string): ModelSelectOption[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return options;
  }
  return options.filter(option => option.type !== 'section' && getModelOptionSearchText(option).includes(trimmedQuery));
}

function getModelOptionSearchText(option: ModelSelectOption): string {
  return [
    typeof option.label === 'string' ? option.label : '',
    option.value,
    option.description,
    option.descriptionForModel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function ModelSearchBar({
  isActive,
  query,
  cursorOffset,
  matchCount,
  totalCount,
}: {
  isActive: boolean;
  query: string;
  cursorOffset: number;
  matchCount: number;
  totalCount: number;
}) {
  const isTerminalFocused = useTerminalFocus();
  return (
    <Box marginBottom={1} flexDirection="column">
      <SearchBox
        query={query}
        cursorOffset={cursorOffset}
        placeholder="Type to search models..."
        isFocused={isActive}
        isTerminalFocused={isTerminalFocused}
      />
      {query && (
        <Box paddingLeft={1}>
          <Text color="subtle">
            Found {matchCount} of {totalCount} models
          </Text>
        </Box>
      )}
    </Box>
  );
}
function resolveOptionModel(value?: string, providerId?: string): string | undefined {
  if (!value) return undefined;
  if (value === NO_PREFERENCE) {
    if (providerId) {
      const providerManager = ProviderManager.getInstance();
      const entry = getProviderRegistryEntry(providerId as any);
      return providerManager.getModelForProvider(providerId as any) ?? entry?.defaultModel ?? getDefaultMainLoopModel();
    }
    return getDefaultMainLoopModel();
  }
  return parseUserSpecifiedModel(value);
}
function EffortLevelIndicator(t0) {
  const $ = _c(5);
  const { effort } = t0;
  const t1 = effort ? 'claude' : 'subtle';
  const t2 = effort ?? 'low';
  let t3;
  if ($[0] !== t2) {
    t3 = effortLevelToSymbol(t2);
    $[0] = t2;
    $[1] = t3;
  } else {
    t3 = $[1];
  }
  let t4;
  if ($[2] !== t1 || $[3] !== t3) {
    t4 = <Text color={t1}>{t3}</Text>;
    $[2] = t1;
    $[3] = t3;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}
function cycleEffortLevel(current: EffortLevel, direction: 'left' | 'right', includeMax: boolean): EffortLevel {
  const levels: EffortLevel[] = includeMax ? ['low', 'medium', 'high', 'max'] : ['low', 'medium', 'high'];
  // If the current level isn't in the cycle (e.g. 'max' after switching to a
  // non-Opus model), clamp to 'high'.
  const idx = levels.indexOf(current);
  const currentIndex = idx !== -1 ? idx : levels.indexOf('high');
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!;
  } else {
    return levels[(currentIndex - 1 + levels.length) % levels.length]!;
  }
}
function getDefaultEffortLevelForOption(value?: string, providerId?: string): EffortLevel {
  const resolved = resolveOptionModel(value, providerId) ?? getDefaultMainLoopModel();
  const defaultValue = getDefaultEffortForModel(resolved);
  return defaultValue !== undefined ? convertEffortValueToLevel(defaultValue) : 'high';
}

function formatProviderModelSetting(providerId: string, modelId: string): string {
  return modelId.includes('/') ? modelId : `${providerId}/${modelId}`;
}

function getSelectableProviderIds(): string[] {
  // Show all registered providers so users can browse models across all providers
  return [...PROVIDER_IDS];
}

function ProviderTabs({
  providerIds,
  activeProviderId,
  modelCount,
  matchedModelCount,
  isFiltering,
}: {
  providerIds: string[];
  activeProviderId: string;
  modelCount: number;
  matchedModelCount: number;
  isFiltering: boolean;
}) {
  if (providerIds.length <= 1) return null;

  const activeIndex = Math.max(0, providerIds.indexOf(activeProviderId));
  const activeLabel = truncateProviderLabel(PROVIDER_REGISTRY[activeProviderId]?.label ?? activeProviderId, 24);
  const modelCountLabel = isFiltering ? `${matchedModelCount}/${modelCount}` : String(modelCount);

  return (
    <Box marginTop={1}>
      <Text dimColor={true}>Provider: </Text>
      <Text color="remember" bold={true}>
        [{activeLabel}]
      </Text>
      <Text color="subtle">
        {' '}
        {activeIndex + 1}/{providerIds.length} · Models {modelCountLabel} · Tab next · Shift+Tab prev
      </Text>
    </Box>
  );
}

function truncateProviderLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 1))}…`;
}
