import chalk from 'chalk';
import capitalize from 'lodash-es/capitalize.js';
import type * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { c as _c } from 'react/compiler-runtime';
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js';
import { useSearchInput } from 'src/hooks/useSearchInput.js';
import { ProviderManager } from 'src/services/ai/ProviderManager.js';
import { getProviderRegistryEntry, type ProviderModelInfo } from 'src/services/ai/providerRegistry.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js';
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
import { getModelOptions } from '../utils/model/modelOptions.js';
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
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void;
  /** Press `d` in the picker to persist the focused model as the default for new sessions. */
  onSetDefault?: (model: string | null, effort: EffortLevel | undefined) => void;
  onCancel?: () => void;
  isStandaloneCommand?: boolean;
  showFastModeNotice?: boolean;
  /** Overrides the dim header line below "Select model". */
  headerText?: string;
  /**
   * When true, skip writing effortLevel to userSettings on selection.
   * Used by the assistant installer wizard where the model choice is
   * project-scoped (written to the assistant's .claude/settings.json via
   * install.ts) and should not leak to the user's global ~/.claude/settings.
   */
  skipSettingsWrite?: boolean;
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
    showFastModeNotice,
    headerText,
    skipSettingsWrite,
  } = t0;
  const setAppState = useSetAppState();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const initialValue = initial === null ? NO_PREFERENCE : initial;
  const [focusedValue, setFocusedValue] = useState(initialValue);
  const isFastMode = useAppState(_temp);
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
    onCancel: onCancel,
    backspaceExitsOnEmpty: false,
  });
  const t2 = Boolean(isFastMode);

  const providerInfo = useMemo(() => getActiveProviderInfo(), [fetchedModelsData]);

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
  }, [setAppState, fetchedModelsData, providerInfo?.providerId]);

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
    return getEffectiveModelOptions(t2, currentFetchedModels, providerInfo?.entry);
  }, [t2, currentFetchedModels, providerInfo?.entry]);
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
  let focusedSupportsEffort;
  let t8;
  if ($[20] !== effectiveFocusedValue) {
    const focusedModel = resolveOptionModel(effectiveFocusedValue);
    focusedSupportsEffort = focusedModel ? modelSupportsEffort(focusedModel) : false;
    t8 = focusedModel ? modelSupportsMaxEffort(focusedModel) : false;
    $[20] = effectiveFocusedValue;
    $[21] = focusedSupportsEffort;
    $[22] = t8;
  } else {
    focusedSupportsEffort = $[21];
    t8 = $[22];
  }
  const focusedSupportsMax = t8;
  let t9;
  if ($[23] !== effectiveFocusedValue) {
    t9 = getDefaultEffortLevelForOption(effectiveFocusedValue);
    $[23] = effectiveFocusedValue;
    $[24] = t9;
  } else {
    t9 = $[24];
  }
  const focusedDefaultEffort = t9;
  const displayEffort = effort === 'max' && !focusedSupportsMax ? 'high' : effort;
  let t10;
  if ($[25] !== effortValue || $[26] !== hasToggledEffort) {
    t10 = value => {
      setFocusedValue(value);
      if (!hasToggledEffort && effortValue === undefined) {
        setEffort(getDefaultEffortLevelForOption(value));
      }
    };
    $[25] = effortValue;
    $[26] = hasToggledEffort;
    $[27] = t10;
  } else {
    t10 = $[27];
  }
  const handleFocus = t10;
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
            onSelect(customModelId.trim(), effort);
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
        isStandaloneCommand &&
        onSetDefault &&
        (input === 'd' || input === 'D') &&
        !key.ctrl &&
        !key.meta
      ) {
        const modelValue = resolveOptionModel(effectiveFocusedValue);
        const selectedEffort =
          hasToggledEffort && modelValue && modelSupportsEffort(modelValue) ? effort : undefined;
        onSetDefault(effectiveFocusedValue === NO_PREFERENCE ? null : effectiveFocusedValue, selectedEffort);
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
    $[37] !== onSelect ||
    $[38] !== setAppState ||
    $[39] !== skipSettingsWrite
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
          getDefaultEffortLevelForOption(value_0),
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
      const selectedModel = resolveOptionModel(value_0);
      const selectedEffort =
        hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel) ? effort : undefined;
      if (value_0 === NO_PREFERENCE) {
        onSelect(null, selectedEffort);
        return;
      }
      onSelect(value_0, selectedEffort);
    };
    $[35] = effort;
    $[36] = hasToggledEffort;
    $[37] = onSelect;
    $[38] = setAppState;
    $[39] = skipSettingsWrite;
    $[40] = t14;
  } else {
    t14 = $[40];
  }
  const handleSelect = t14;
  const baseHeaderText = headerText ?? getDefaultHeaderText();
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
            Press {chalk.bold('Enter')} to confirm or {chalk.bold('Esc')} to go back
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
        </Box>
        <ModelSearchBar
          isActive={isSearchActive}
          query={searchQuery}
          cursorOffset={searchCursorOffset}
          matchCount={filteredSelectOptions.length}
          totalCount={selectOptions.length}
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
                onUpFromFirstItem={() => setIsSearchActive(true)}
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
        {isFastModeEnabled() ? (
          showFastModeNotice ? (
            <Box marginBottom={1}>
              <Text dimColor={true}>
                Fast mode is <Text bold={true}>ON</Text> and available with {FAST_MODE_MODEL_DISPLAY} only (/fast).
                Switching to other models turn off fast mode.
              </Text>
            </Box>
          ) : isFastModeAvailable() && !isFastModeCooldown() ? (
            <Box marginBottom={1}>
              <Text dimColor={true}>
                Use <Text bold={true}>/fast</Text> to turn on Fast mode ({FAST_MODE_MODEL_DISPLAY} only).
              </Text>
            </Box>
          ) : null
        ) : null}
      </Box>
      {isStandaloneCommand && (
        <Text dimColor={true} italic={true}>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              {onSetDefault && <KeyboardShortcutHint shortcut="d" action="set default for new sessions" />}
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
function _temp(s) {
  return isFastModeEnabled() ? s.fastMode : false;
}
function getDefaultHeaderText(): string {
  const providerInfo = getActiveProviderInfo();
  if (!providerInfo) {
    return 'Switch between Claude models. Applies to this session.';
  }
  return `Switch to ${providerInfo.entry.label} model. Applies to the current session.`;
}

function getActiveProviderInfo(): {
  entry: ReturnType<typeof getProviderRegistryEntry>;
  selectedModel: string | undefined;
  providerId: string;
} | null {
  const providerManager = ProviderManager.getInstance();
  const providerId = providerManager.getActiveProviderName();
  const config = providerManager.getSelectedProviderConfig(true);

  const entry = getProviderRegistryEntry(providerId);
  if (!entry) return null;

  return {
    entry,
    selectedModel: providerManager.getModelForProvider(providerId),
    providerId,
  };
}

function getEffectiveModelOptions(
  fastMode: boolean,
  fetchedModels?: FetchedModel[] | null,
  entry?: ReturnType<typeof getProviderRegistryEntry>,
): Array<{
  value: ModelSetting;
  label: string;
  description: string;
  descriptionForModel?: string;
}> {
  const providerInfo = getActiveProviderInfo();
  if (!providerInfo && !entry) {
    return getModelOptions(fastMode);
  }
  const providerEntry = entry ?? providerInfo?.entry;
  if (!providerEntry || !providerEntry.models) {
    return fetchedModels
      ? fetchedModels.map(fetched => ({
          value: fetched.id,
          label: fetched.label,
          description: fetched.description || fetched.id,
          descriptionForModel: fetched.id,
        }))
      : [];
  }

  const implementationType = ProviderManager.getInstance().getImplementationType();
  const defaultModel = providerInfo?.selectedModel ?? providerEntry.defaultModel ?? 'provider default';

  // Start with static models from registry, filtered by implementation type
  const staticModels = providerEntry.models
    .filter(model => !model.supportedTypes || model.supportedTypes.includes(implementationType))
    .map(model => toProviderModelOption(model));

  // Merge with fetched models if available (deduplicate by id)
  const allModels = [...staticModels];
  if (fetchedModels && fetchedModels.length > 0) {
    const existingIds = new Set(staticModels.map(m => m.value));
    for (const fetched of fetchedModels) {
      if (!existingIds.has(fetched.id)) {
        allModels.push({
          value: fetched.id,
          label: fetched.label,
          description: fetched.description || fetched.id,
          descriptionForModel: fetched.id,
        });
        existingIds.add(fetched.id);
      }
    }
  }

  // Check if provider supports API model fetching
  const hasModelsEndpoint = 'modelsUrl' in providerEntry && providerEntry.modelsUrl;

  const options = [
    {
      value: null,
      label: 'Default (recommended)',
      description: `Use ${providerEntry.label} default (${defaultModel})`,
    },
    ...allModels,
  ];

  // Always add custom input option as the last item
  options.push({
    value: '__CUSTOM_INPUT__',
    label: '✏️  Type custom model ID',
    description: `Use: /model your-model-id`,
  });

  return options as any;
}
function toProviderModelOption(model: ProviderModelInfo) {
  const label = model.label ?? model.id;
  const tags = model.tags?.slice(0, 3).join(' · ');
  return {
    value: model.id,
    label,
    description: tags || model.id,
    descriptionForModel: model.id,
  };
}

type ModelSelectOption = {
  value: string;
  label: React.ReactNode;
  description?: string;
  descriptionForModel?: string;
};

function filterModelOptions(options: ModelSelectOption[], query: string): ModelSelectOption[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return options;
  }
  return options.filter(option => getModelOptionSearchText(option).includes(trimmedQuery));
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
function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined;
  return value === NO_PREFERENCE ? getDefaultMainLoopModel() : parseUserSpecifiedModel(value);
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
function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel();
  const defaultValue = getDefaultEffortForModel(resolved);
  return defaultValue !== undefined ? convertEffortValueToLevel(defaultValue) : 'high';
}
