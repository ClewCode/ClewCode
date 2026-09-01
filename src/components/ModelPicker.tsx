import ansis from 'ansis';
import capitalize from 'lodash-es/capitalize.js';
import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js';
import { useSearchInput } from 'src/hooks/useSearchInput.js';
import { useTerminalSize } from 'src/hooks/useTerminalSize.js';
import { ProviderManager } from 'src/services/ai/ProviderManager.js';
import { getProviderRegistryEntry, PROVIDER_IDS, type ProviderModelInfo } from 'src/services/ai/providerRegistry.js';
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
import { fetchOpenRouterCapabilityCatalog, findOpenRouterCapabilities } from '../utils/model/openRouterCapabilities.js';
import { mergeRecentModels } from '../utils/model/recentModels.js';
import { getModelCosts } from '../utils/modelCost.js';
import { getSettingsForSource, updateSettingsForSource } from '../utils/settings/settings.js';
import { type OptionWithDescription, Select } from './CustomSelect/index.js';
import { Pane } from './design-system/Pane.js';
import { effortLevelToSymbol } from './EffortIndicator.js';
import { Markdown } from './Markdown.js';
import { SearchBox } from './SearchBox.js';

export type Props = {
  initial: string | null;
  sessionModel?: ModelSetting;
  /** Press Enter (or `s`) to use the focused model for this session only. */
  onSelect?: (model: string | null, effort: EffortLevel | undefined) => void;
  /** Press `d` to persist the focused model as the default for new sessions. Enter falls back to this if onSelect is not provided. */
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
const CUSTOM_INPUT = '__CUSTOM_INPUT__';
const SECTION_PREFIX = '__SECTION_';

/**
 * One row in the unified list. `providerId`/`modelId` are carried on the option
 * itself so selection never has to re-parse the value — provider-routed ids like
 * `openrouter/deepseek/deepseek-chat` contain slashes of their own.
 */
type ModelOption = {
  value: string;
  label: string;
  description: string;
  descriptionForModel?: string;
  providerId?: string;
  modelId?: string;
  type?: 'text' | 'section';
  disabled?: boolean;
  hideIndex?: boolean;
  capabilities?: ModelCapabilityDisplay;
};

export type ModelCapabilityDisplay = {
  context?: number | 'varies';
  vision?: boolean;
  tools?: boolean;
  reasoning?: boolean;
};

export function ModelPicker({
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
}: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const exitState = useExitOnCtrlCDWithKeybindings();
  const [focusedValue, setFocusedValue] = useState<string | undefined>(undefined);
  const [hasToggledEffort, setHasToggledEffort] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  // Let the list own arrow keys when the picker opens. Search is activated by
  // the first typed character so ↑/↓ never get swallowed by the search input.
  const [isSearchActive, setIsSearchActive] = useState(false);
  // Bumped by Tab/Shift+Tab to remount Select so it re-reads defaultFocusValue.
  const [jumpToken, setJumpToken] = useState(0);
  const [jumpTarget, setJumpTarget] = useState<string | undefined>(undefined);
  const [view, setView] = useState<'models' | 'providers'>('models');

  const effortValue = useAppState(s => s.effortValue);
  const fastMode = useAppState(s => s.fastMode);
  const { columns, rows } = useTerminalSize();
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined,
  );

  const [fetchedModelsByProvider, setFetchedModelsByProvider] = useState<Record<string, FetchedModel[]>>({});
  const [openRouterCatalog, setOpenRouterCatalog] = useState<FetchedModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const hasRequestedModels = useRef(false);

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: isSearchActive,
    onExit: () => setIsSearchActive(false),
    backspaceExitsOnEmpty: false,
  });

  const activeProviderId = useMemo(() => ProviderManager.getInstance().getActiveProviderName(), []);

  // Refresh every configured provider in parallel when the picker opens. Providers
  // without credentials are skipped and continue using the static registry.
  useEffect(() => {
    const loadModels = async () => {
      if (hasRequestedModels.current) return;
      hasRequestedModels.current = true;

      setIsFetchingModels(true);
      try {
        const providerManager = ProviderManager.getInstance();
        const providers = PROVIDER_IDS.filter(
          provider =>
            supportsModelFetching(provider) &&
            (provider === activeProviderId || Boolean(providerManager.getApiKeyForProvider(provider))),
        );
        const [results, catalog] = await Promise.all([
          Promise.all(providers.map(async provider => ({ provider, models: await fetchProviderModels(provider) }))),
          fetchOpenRouterCapabilityCatalog(),
        ]);
        const nextModels = Object.fromEntries(
          results
            .filter(result => result.models && result.models.length > 0)
            .map(result => [result.provider, result.models]),
        ) as Record<string, FetchedModel[]>;
        setFetchedModelsByProvider(nextModels);
        setOpenRouterCatalog(catalog);
      } finally {
        setIsFetchingModels(false);
      }
    };
    loadModels();
  }, [activeProviderId]);

  const allOptions = useMemo(
    () =>
      buildUnifiedModelOptions({
        fetchedModelsByProvider,
        activeProviderId,
        initial,
        defaultOptionLabel,
        defaultOptionDescription,
        openRouterCatalog,
      }),
    [
      fetchedModelsByProvider,
      activeProviderId,
      initial,
      defaultOptionLabel,
      defaultOptionDescription,
      openRouterCatalog,
    ],
  );

  const optionsByValue = useMemo(() => new Map(allOptions.map(opt => [opt.value, opt])), [allOptions]);

  const filteredOptions = useMemo(() => filterModelOptions(allOptions, searchQuery), [allOptions, searchQuery]);

  const totalModelCount = countRealModelOptions(allOptions);
  const matchedModelCount = countRealModelOptions(filteredOptions);

  // `initial` is a bare model id, but rows are keyed by `provider/model` — find
  // the row it belongs to so the current model still shows as selected.
  const initialValue =
    initial === null ? NO_PREFERENCE : (allOptions.find(opt => opt.modelId === initial)?.value ?? initial);

  // While searching, focus the first hit; otherwise prefer the current model.
  const initialFocusValue = searchQuery
    ? filteredOptions.find(isRealModelOption)?.value
    : filteredOptions.some(opt => opt.value === initialValue)
      ? initialValue
      : (filteredOptions.find(isRealModelOption)?.value ?? undefined);

  const visibleCount = Math.min(Math.max(5, rows - 15), filteredOptions.length);
  const hiddenCount = Math.max(0, filteredOptions.length - visibleCount);

  const effectiveFocusedValue = filteredOptions.some(opt => opt.value === focusedValue)
    ? focusedValue
    : initialFocusValue;
  const focusedOption = effectiveFocusedValue ? optionsByValue.get(effectiveFocusedValue) : undefined;
  const focusedModelName = focusedOption?.label;

  const focusedModel = resolveOptionModel(focusedOption, activeProviderId);
  const focusedSupportsEffort = focusedModel ? modelSupportsEffort(focusedModel) : false;
  const focusedSupportsMax = focusedModel ? modelSupportsMaxEffort(focusedModel) : false;
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedOption, activeProviderId);
  const displayEffort = effort === 'max' && !focusedSupportsMax ? 'high' : effort;

  const renderedOptions = filteredOptions.map(option => {
    if (option.type === 'section') return option;
    const optionModel = resolveOptionModel(option, activeProviderId);
    const optionEffort =
      option.value === effectiveFocusedValue
        ? displayEffort
        : optionModel && modelSupportsEffort(optionModel)
          ? getDefaultEffortLevelForOption(option, activeProviderId)
          : undefined;
    const preview = modelPreview(option);
    return {
      ...option,
      label: (
        <ModelListRow
          label={option.label}
          capabilities={option.capabilities}
          effort={optionEffort}
          isCurrent={option.value === initialValue}
          isFocused={option.value === effectiveFocusedValue}
          columns={columns}
        />
      ),
      description: '',
      preview,
    };
  });

  function handleFocus(value: string): void {
    setFocusedValue(value);
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(optionsByValue.get(value), activeProviderId));
    }
  }

  function handleCycleEffort(direction: 'left' | 'right'): void {
    if (!focusedSupportsEffort) return;
    setEffort(prev => cycleEffortLevel(prev ?? focusedDefaultEffort, direction, focusedSupportsMax));
    setHasToggledEffort(true);
  }

  // Applies the focused effort to the running session. `persist` also writes it
  // to userSettings, which every future session reads — so it is only ever true
  // on the explicit set-as-default path, never on a session-scoped selection.
  function applyEffort(option: ModelOption | undefined, persist: boolean): EffortLevel | undefined {
    const selectedModel = resolveOptionModel(option, activeProviderId);
    const selectedEffort = hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel) ? effort : undefined;
    if (skipSettingsWrite) {
      return selectedEffort;
    }
    const effortLevel = resolvePickerEffortPersistence(
      effort,
      getDefaultEffortLevelForOption(option, activeProviderId),
      getSettingsForSource('userSettings')?.effortLevel,
      hasToggledEffort,
    );
    if (persist) {
      const persistable = toPersistableEffort(effortLevel);
      // 'xhigh' isn't in the settings schema — writing it would be dropped on
      // the next read, so leave the stored level alone instead.
      if (persistable !== undefined && persistable !== 'xhigh') {
        updateSettingsForSource('userSettings', { effortLevel: persistable });
      }
    }
    setAppState(prev => ({ ...prev, effortValue: effortLevel }));
    return selectedEffort;
  }

  /** The `provider/model` string handed back to the caller. */
  function modelSettingFor(option: ModelOption | undefined): string | null {
    if (!option || option.value === NO_PREFERENCE) return `${activeProviderId}/default`;
    if (option.providerId && option.modelId) return `${option.providerId}/${option.modelId}`;
    return option.value;
  }

  function jumpProviderSection(direction: 1 | -1): void {
    const sections = filteredOptions.filter(opt => opt.type === 'section');
    if (sections.length === 0) return;
    const currentIndex = effectiveFocusedValue
      ? filteredOptions.findIndex(opt => opt.value === effectiveFocusedValue)
      : -1;
    const sectionIndexes = sections.map(s => filteredOptions.indexOf(s));
    const target =
      direction === 1
        ? (sectionIndexes.find(i => i > currentIndex) ?? sectionIndexes[0]!)
        : (sectionIndexes.filter(i => i < currentIndex).pop() ?? sectionIndexes[sectionIndexes.length - 1]!);
    const firstModel = filteredOptions.slice(target + 1).find(isRealModelOption);
    if (!firstModel) return;
    setFocusedValue(firstModel.value);
    setJumpTarget(firstModel.value);
    setJumpToken(t => t + 1);
  }

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
            onSelect?.(`${activeProviderId}/${customModelId.trim()}`, effort);
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

      // Tab now toggles between Models and Providers (merged /providers into /model)
      if (key.tab) {
        setView(v => (v === 'models' ? 'providers' : 'models'));
        return;
      }

      if (
        !isSearchActive &&
        input.length > 0 &&
        !key.ctrl &&
        !key.meta &&
        !key.return &&
        !key.tab &&
        !key.backspace &&
        !key.delete &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow
      ) {
        setSearchQuery(input);
        setIsSearchActive(true);
        return;
      }

      // `s` is kept as an alias for Enter (session-only) so existing muscle
      // memory still does the safe thing after Enter stopped persisting.
      if (
        !isSearchActive &&
        isStandaloneCommand &&
        onSelect &&
        (input === 's' || input === 'S') &&
        !key.ctrl &&
        !key.meta
      ) {
        onSelect(modelSettingFor(focusedOption), applyEffort(focusedOption, false));
      }

      // `g`/`d` are the in-picker paths that write the global default.
      if (
        !isSearchActive &&
        isStandaloneCommand &&
        onSetDefault &&
        (input === 'g' || input === 'G' || input === 'd' || input === 'D') &&
        !key.ctrl &&
        !key.meta
      ) {
        onSetDefault(modelSettingFor(focusedOption), applyEffort(focusedOption, true));
      }
    },
    { isActive: true },
  );

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    },
    { context: 'ModelPicker' },
  );

  function handleSelect(value: string): void {
    if (value === CUSTOM_INPUT) {
      setShowCustomInput(true);
      setIsSearchActive(false); // Deactivate model search to focus on custom input
      return;
    }

    logEvent('tengu_model_command_menu_effort', {
      effort: effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });

    const option = optionsByValue.get(value);
    // Enter is session-scoped. Persisting is opt-in via `d`.
    const selectedEffort = applyEffort(option, false);
    const handler = onSelect ?? onSetDefault;
    handler?.(modelSettingFor(option), selectedEffort);
  }

  const baseHeaderText = headerText ?? 'Switch between models from any provider. Applies to this session.';
  const displayHeaderText = isFetchingModels ? `${baseHeaderText} (fetching models...)` : baseHeaderText;

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

  const providerPreview = (id: string): React.ReactNode => {
    const entry = getProviderRegistryEntry(id as any);
    const hasKey = Boolean(ProviderManager.getInstance().getApiKeyForProvider(id as any));
    return (
      <Box flexDirection="column">
        <Text bold color="suggestion">
          {entry?.label ?? id}
        </Text>
        <Text dimColor>{entry?.note ?? ''}</Text>
        <Text>key: {hasKey ? 'saved' : entry?.isLocal ? 'not required' : `missing ${entry?.envKey}`}</Text>
        <Box marginTop={1}>
          <Markdown>{`Provider \`${id}\` — ${entry?.defaultModel ?? ''}`}</Markdown>
        </Box>
        <Text dimColor>Tab สลับกลับ Models · Enter เลือก</Text>
      </Box>
    );
  };

  const providerOptionsAll = PROVIDER_IDS.map(id => {
    const entry = getProviderRegistryEntry(id as any);
    const hasKey = Boolean(ProviderManager.getInstance().getApiKeyForProvider(id as any));
    const isActive = id === activeProviderId;
    return {
      value: id,
      label: entry?.label ?? id,
      description: `${isActive ? '● current · ' : ''}${hasKey ? 'configured' : entry?.isLocal ? 'not required' : 'missing key'}`,
      preview: providerPreview(id),
    } as OptionWithDescription<string>;
  });

  const providerFiltered = searchQuery
    ? providerOptionsAll.filter(
        o =>
          String(o.label).toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.value.includes(searchQuery.toLowerCase()),
      )
    : providerOptionsAll;

  const providerList = (
    <Box flexDirection="column">
      <Select
        options={providerFiltered as OptionWithDescription<string>[]}
        visibleOptionCount={12}
        onChange={v => {
          setSearchQuery(v);
          setView('models');
        }}
        onCancel={() => setView('models')}
      />
    </Box>
  );

  const modelList = (
    <Box flexDirection="column">
      {isStandaloneCommand && filteredOptions.length > 0 && <ModelListHeader columns={columns} />}
      {filteredOptions.length > 0 ? (
        <Select
          key={`models-${jumpToken}`}
          isDisabled={isSearchActive}
          defaultValue={isStandaloneCommand ? undefined : initialValue}
          defaultFocusValue={jumpTarget ?? initialFocusValue}
          options={(isStandaloneCommand ? renderedOptions : filteredOptions) as OptionWithDescription<string>[]}
          onChange={handleSelect}
          onFocus={handleFocus}
          onCancel={onCancel ?? noop}
          visibleOptionCount={visibleCount}
          highlightText={isStandaloneCommand ? undefined : searchQuery}
          hideIndexes={true}
          showPreviewDefault={isStandaloneCommand ? false : undefined}
        />
      ) : (
        <Box paddingLeft={3}>
          <Text color="error">No matching models</Text>
        </Box>
      )}
    </Box>
  );

  const content =
    view === 'providers' ? (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text>models</Text>
          <Text color="suggestion" bold>
            [providers]
          </Text>
          <Text dimColor>Tab สลับ</Text>
        </Box>
        <ModelSearchBar
          isActive={isSearchActive}
          query={searchQuery}
          cursorOffset={searchCursorOffset}
          matchCount={providerFiltered.length}
          totalCount={providerOptionsAll.length}
          compact
        />
        {providerList}
        <Box marginTop={1}>
          <Text dimColor>Tab: Models · ↑/↓ เลื่อน · p preview</Text>
        </Box>
      </Box>
    ) : isStandaloneCommand ? (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="suggestion" bold>
            [models]
          </Text>
          <Text>providers</Text>
          <Text dimColor>Tab สลับ</Text>
        </Box>
        <ModelSearchBar
          isActive={isSearchActive}
          query={searchQuery}
          cursorOffset={searchCursorOffset}
          matchCount={matchedModelCount}
          totalCount={totalModelCount}
          compact
        />
        {isFetchingModels && (
          <Box paddingLeft={2} marginBottom={1}>
            <Text color="subtle">Refreshing configured providers…</Text>
          </Box>
        )}
        {sessionModel && (
          <Box paddingLeft={2} marginBottom={1}>
            <Text color="subtle">Session override: {modelDisplayString(sessionModel)}</Text>
          </Box>
        )}
        {modelList}
        <Box paddingLeft={2} marginTop={1}>
          <Text>
            Fast Mode <Text dimColor>{fastMode ? 'On' : 'Off'}</Text>
          </Text>
        </Box>
        <ModelPricePanel model={focusedModel} columns={columns} />
        <Box marginTop={1}>
          <Text color="subtle" italic={true}>
            {exitState.pending ? (
              <>Press {exitState.keyName} again to exit</>
            ) : (
              <>
                type to search · ↑/↓ navigate · ←/→ effort · enter session
                {onSetDefault ? ' · d default' : ''} · esc clear
              </>
            )}
          </Text>
        </Box>
      </Box>
    ) : (
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
          matchCount={matchedModelCount}
          totalCount={totalModelCount}
        />
        <Box flexDirection="column" marginBottom={1}>
          {modelList}
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
    );

  if (!isStandaloneCommand) {
    return content;
  }
  return <Pane color="permission">{content}</Pane>;
}

function noop(): void {
  /* noop */
}

/**
 * Every provider's models in one list, grouped by provider. The active provider
 * leads so the models you can use right now are the first thing on screen; the
 * rest follow in registry order.
 */
export function buildUnifiedModelOptions({
  fetchedModels,
  fetchedModelsByProvider,
  activeProviderId,
  initial,
  defaultOptionLabel,
  defaultOptionDescription,
  openRouterCatalog = [],
}: {
  fetchedModels?: FetchedModel[] | null;
  fetchedModelsByProvider?: Record<string, FetchedModel[]>;
  activeProviderId: string;
  initial?: string | null;
  defaultOptionLabel?: string;
  defaultOptionDescription?: string;
  openRouterCatalog?: FetchedModel[];
}): ModelOption[] {
  const providerManager = ProviderManager.getInstance();
  const implementationType = providerManager.getImplementationType();

  const modelsForProvider = (providerId: string): ModelOption[] => {
    const entry = getProviderRegistryEntry(providerId as any);
    if (!entry) return [];
    const staticModels = (entry.models ?? [])
      .filter(m => !m.supportedTypes || m.supportedTypes.includes(implementationType))
      .map(m => toProviderModelOption(providerId, m, openRouterCatalog));

    const liveModels =
      fetchedModelsByProvider?.[providerId] ?? (providerId === activeProviderId ? fetchedModels : null);
    if (!liveModels || liveModels.length === 0) {
      return staticModels;
    }

    // Live models win for the active provider, but static entries backfill:
    // some provider APIs return partial lists or are temporarily unreachable.
    const live: ModelOption[] = liveModels.map(m => {
      const fallback = staticModels.find(option => option.modelId === m.id);
      const openRouter = findOpenRouterCapabilities(m.id, openRouterCatalog);
      const registryContext = fallback?.capabilities?.context;
      const capabilities: ModelCapabilityDisplay = {
        context:
          m.contextWindow ??
          (typeof registryContext === 'number' ? registryContext : undefined) ??
          openRouter?.contextWindow ??
          registryContext,
        vision: m.supportsVision ?? fallback?.capabilities?.vision ?? openRouter?.supportsVision,
        tools: m.supportsTools ?? fallback?.capabilities?.tools ?? openRouter?.supportsTools,
        reasoning: m.supportsReasoning ?? fallback?.capabilities?.reasoning ?? openRouter?.supportsReasoning,
      };
      const parts: string[] = [];
      if (capabilities.context) parts.push(`${formatModelContext(capabilities.context)} ctx`);
      if (capabilities.vision) parts.push('vision');
      if (capabilities.tools) parts.push('tools');
      if (capabilities.reasoning) parts.push('reasoning');
      if (m.free) parts.push('free');
      if (m.maxOutput) parts.push(`${formatContext(m.maxOutput)} out`);
      return {
        value: `${providerId}/${m.id}`,
        label: m.label,
        description: parts.length > 0 ? parts.join(' · ') : (m.description ?? m.id),
        descriptionForModel: m.id,
        providerId,
        modelId: m.id,
        capabilities,
      };
    });
    const liveIds = new Set(live.map(m => m.modelId));
    return [...live, ...staticModels.filter(sm => !liveIds.has(sm.modelId))];
  };

  const orderedProviderIds = [activeProviderId, ...PROVIDER_IDS.filter(id => id !== activeProviderId)];
  const modelsByProvider = new Map(orderedProviderIds.map(id => [id, modelsForProvider(id)] as const));
  const allModels = [...modelsByProvider.values()].flat();

  const options: ModelOption[] = [];

  // Recents first — these are matched against the fully-qualified value so a
  // bare model id from settings still resolves to its provider's row.
  const byModelId = new Map(allModels.map(m => [m.modelId!, m] as const));
  const recentModels = mergeRecentModels([initial, providerManager.getModelForProvider(activeProviderId as any)])
    .map(id => (id ? byModelId.get(id) : undefined))
    .filter((m): m is ModelOption => Boolean(m));

  if (recentModels.length > 0) {
    options.push(sectionOption('recent', 'Recent'));
    for (const model of recentModels) {
      options.push({ ...model, description: 'Recently used' });
    }
  }

  const activeEntry = getProviderRegistryEntry(activeProviderId as any);
  const activeDefaultModel =
    providerManager.getModelForProvider(activeProviderId as any) ?? activeEntry?.defaultModel ?? 'provider default';
  const activeDefaultOption = allModels.find(
    option => option.providerId === activeProviderId && option.modelId === activeDefaultModel,
  );
  options.push({
    value: NO_PREFERENCE,
    label: defaultOptionLabel ?? 'Default (recommended)',
    description:
      defaultOptionDescription ?? `Use ${activeEntry?.label ?? activeProviderId} default (${activeDefaultModel})`,
    capabilities: activeDefaultOption?.capabilities,
  });

  const recentValues = new Set(recentModels.map(m => m.value));
  for (const providerId of orderedProviderIds) {
    const models = (modelsByProvider.get(providerId) ?? []).filter(m => !recentValues.has(m.value));
    if (models.length === 0) continue;
    const entry = getProviderRegistryEntry(providerId as any);
    options.push(sectionOption(providerId, entry?.label ?? providerId));
    options.push(...models);
  }

  options.push({
    value: CUSTOM_INPUT,
    label: '✏️  Type custom model ID',
    description: 'Use: /model your-model-id',
  });

  return options;
}

function sectionOption(id: string, label: string): ModelOption {
  return {
    value: `${SECTION_PREFIX}${id}__`,
    label,
    description: '',
    type: 'section',
    disabled: true,
  };
}

function toProviderModelOption(
  providerId: string,
  model: ProviderModelInfo,
  openRouterCatalog: readonly FetchedModel[],
): ModelOption {
  const label = model.label ?? model.id;
  const parts: string[] = [];
  const cap = model.capabilities;
  const openRouter = findOpenRouterCapabilities(model.id, openRouterCatalog);

  if (cap.maxContext) {
    const ctx = typeof cap.maxContext === 'number' ? formatContext(cap.maxContext) : 'varies';
    parts.push(`${ctx} ctx`);
  }
  if (cap.vision) parts.push('vision');
  if (cap.toolCalling && cap.toolCalling !== 'none') parts.push('tools');
  if (cap.reasoning) parts.push('reasoning');
  if (cap.free || /:free(?:$|[?#])/i.test(model.id) || /\bfree\b/i.test(label)) parts.push('free');

  const description = parts.length > 0 ? parts.join(' · ') : model.tags?.slice(0, 3).join(' · ') || model.id;

  return {
    value: `${providerId}/${model.id}`,
    label,
    description,
    descriptionForModel: model.id,
    providerId,
    modelId: model.id,
    capabilities: {
      context: typeof cap.maxContext === 'number' ? cap.maxContext : (openRouter?.contextWindow ?? cap.maxContext),
      vision: cap.vision,
      tools: cap.toolCalling !== 'none',
      reasoning: cap.reasoning,
    },
  };
}

function formatContext(ctx: number): string {
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
  return String(ctx);
}

export function formatModelContext(context: number | 'varies' | undefined): string {
  if (context === undefined) return '?';
  return context === 'varies' ? 'varies' : formatContext(context);
}

function countRealModelOptions(options: ModelOption[]): number {
  return options.filter(isRealModelOption).length;
}

function isRealModelOption(option: ModelOption): boolean {
  if (option.type === 'section') return false;
  if (!option.value) return false;
  if (option.value === NO_PREFERENCE) return false;
  if (option.value === CUSTOM_INPUT) return false;
  return !option.value.startsWith(SECTION_PREFIX);
}

/**
 * Filtering drops section headers, then puts back any header that still has at
 * least one match under it — otherwise results lose their provider grouping.
 */
function filterModelOptions(options: ModelOption[], query: string): ModelOption[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return options;

  const result: ModelOption[] = [];
  let pendingSection: ModelOption | undefined;
  for (const option of options) {
    if (option.type === 'section') {
      pendingSection = option;
      continue;
    }
    if (!getModelOptionSearchText(option).includes(trimmedQuery)) continue;
    if (pendingSection) {
      result.push(pendingSection);
      pendingSection = undefined;
    }
    result.push(option);
  }
  return result;
}

function getModelOptionSearchText(option: ModelOption): string {
  return [option.label, option.value, option.description, option.descriptionForModel, option.providerId]
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
  compact = false,
}: {
  isActive: boolean;
  query: string;
  cursorOffset: number;
  matchCount: number;
  totalCount: number;
  compact?: boolean;
}) {
  const isTerminalFocused = useTerminalFocus();
  return (
    <Box marginBottom={1} flexDirection="column">
      <SearchBox
        query={query}
        cursorOffset={cursorOffset}
        placeholder={compact ? 'Type to search' : 'Type to search models...'}
        prefix={compact ? '/' : undefined}
        borderless={compact}
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

type ModelTableLayout = {
  nameWidth: number;
  contextWidth: number;
  showCapabilityColumns: boolean;
  showFullCapabilityNames: boolean;
  showEffort: boolean;
};

function getModelTableLayout(columns: number): ModelTableLayout {
  if (columns >= 96) {
    return {
      nameWidth: 32,
      contextWidth: 8,
      showCapabilityColumns: true,
      showFullCapabilityNames: true,
      showEffort: true,
    };
  }
  if (columns >= 68) {
    return {
      nameWidth: 27,
      contextWidth: 7,
      showCapabilityColumns: true,
      showFullCapabilityNames: false,
      showEffort: true,
    };
  }
  if (columns >= 52) {
    return {
      nameWidth: 21,
      contextWidth: 7,
      showCapabilityColumns: true,
      showFullCapabilityNames: false,
      showEffort: false,
    };
  }
  return {
    nameWidth: Math.max(12, columns - 15),
    contextWidth: 7,
    showCapabilityColumns: false,
    showFullCapabilityNames: false,
    showEffort: false,
  };
}

function ModelListHeader({ columns }: { columns: number }): React.ReactNode {
  const layout = getModelTableLayout(columns);
  return (
    <Box paddingLeft={2}>
      <Text dimColor>{fitColumn('Model', layout.nameWidth)}</Text>
      <Text>{'   '}</Text>
      <Text dimColor>{fitColumn('Ctx', layout.contextWidth)}</Text>
      {layout.showCapabilityColumns &&
        (layout.showFullCapabilityNames ? (
          <>
            <Text dimColor>{fitColumn('Vision', 8)}</Text>
            <Text dimColor>{fitColumn('Tools', 7)}</Text>
            <Text dimColor>{fitColumn('Reason', 8)}</Text>
          </>
        ) : (
          <>
            <Text dimColor>{fitColumn('Vis', 4)}</Text>
            <Text dimColor>{fitColumn('Tool', 5)}</Text>
            <Text dimColor>{fitColumn('Rsn', 4)}</Text>
          </>
        ))}
      {layout.showEffort && <Text dimColor>Effort</Text>}
    </Box>
  );
}

function capabilityMark(value: boolean | undefined): string {
  if (value === undefined) return '?';
  return value ? '✓' : '—';
}

function ModelListRow({
  label,
  capabilities,
  effort,
  isCurrent,
  isFocused,
  columns,
}: {
  label: string;
  capabilities?: ModelCapabilityDisplay;
  effort?: EffortLevel;
  isCurrent: boolean;
  isFocused: boolean;
  columns: number;
}): React.ReactNode {
  const layout = getModelTableLayout(columns);
  const vision = capabilityMark(capabilities?.vision);
  const tools = capabilityMark(capabilities?.tools);
  const reasoning = capabilityMark(capabilities?.reasoning);

  return (
    <>
      <Text>{fitColumn(label, layout.nameWidth)}</Text>
      <Text color={isCurrent ? 'suggestion' : 'subtle'}>{isCurrent ? ' * ' : '   '}</Text>
      <Text dimColor={!isFocused}>{fitColumn(formatModelContext(capabilities?.context), layout.contextWidth)}</Text>
      {layout.showCapabilityColumns &&
        (layout.showFullCapabilityNames ? (
          <>
            <Text dimColor={!isFocused}>{fitColumn(vision, 8)}</Text>
            <Text dimColor={!isFocused}>{fitColumn(tools, 7)}</Text>
            <Text dimColor={!isFocused}>{fitColumn(reasoning, 8)}</Text>
          </>
        ) : (
          <>
            <Text dimColor={!isFocused}>{fitColumn(vision, 4)}</Text>
            <Text dimColor={!isFocused}>{fitColumn(tools, 5)}</Text>
            <Text dimColor={!isFocused}>{fitColumn(reasoning, 4)}</Text>
          </>
        ))}
      {layout.showEffort && <Text dimColor={!isFocused}>{effort ? capitalize(effort) : '—'}</Text>}
    </>
  );
}

function fitColumn(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

function ModelPricePanel({ model, columns }: { model: string | undefined; columns: number }): React.ReactNode {
  if (!model) return null;
  const costs = getModelCosts(model);
  const spectrumWidth = Math.max(20, Math.min(52, columns - 12));
  const markerIndex = getPriceMarkerIndex(costs.inputTokens, spectrumWidth);

  return (
    <Box flexDirection="column" paddingLeft={2} marginTop={1}>
      <Box flexDirection="row">
        {Array.from({ length: spectrumWidth }, (_, index) => (
          <Text
            key={index}
            color={index < spectrumWidth / 3 ? 'success' : index < (spectrumWidth * 2) / 3 ? 'warning' : 'claude'}
            bold={index === markerIndex}
          >
            {index === markerIndex ? '●' : '─'}
          </Text>
        ))}
      </Box>
      <Box flexDirection={columns >= 66 ? 'row' : 'column'} columnGap={4} marginTop={1}>
        <PriceCell label="Input" rate={costs.inputTokens} />
        <PriceCell label="Cache read price" rate={costs.promptCacheReadTokens} />
        <PriceCell label="Output" rate={costs.outputTokens} />
      </Box>
    </Box>
  );
}

function PriceCell({ label, rate }: { label: string; rate: number }): React.ReactNode {
  return (
    <Box flexDirection="column" minWidth={16}>
      <Text dimColor>{label}</Text>
      <Text>{formatModelRate(rate)}</Text>
    </Box>
  );
}

export function formatModelRate(rate: number): string {
  const rounded = rate === 0 ? '0' : String(Number(rate.toPrecision(3)));
  return `$${rounded} / 1M`;
}

/** Log scale keeps cheap and premium models distinguishable on the same strip. */
export function getPriceMarkerIndex(inputRate: number, width: number): number {
  if (width <= 1 || inputRate <= 0) return 0;
  const minRate = 0.01;
  const maxRate = 30;
  const normalized =
    (Math.log10(Math.min(maxRate, Math.max(minRate, inputRate))) - Math.log10(minRate)) /
    (Math.log10(maxRate) - Math.log10(minRate));
  return Math.max(0, Math.min(width - 1, Math.round(normalized * (width - 1))));
}

function modelPreview(option: ModelOption): React.ReactNode {
  if (option.type === 'section' || !option.value) return null;
  const caps: string[] = [];
  if (option.description) caps.push(option.description);
  const example = `**${option.label}**\n\n${option.description || option.modelId || option.value}\n\n\`\`\`js\n// preview with ${option.label}\nconsole.log('hello')\n\`\`\``;
  return (
    <Box flexDirection="column">
      <Text bold color="suggestion">
        {option.label}
      </Text>
      {option.providerId && <Text dimColor>{option.providerId}</Text>}
      <Box marginTop={1}>
        <Markdown>{example}</Markdown>
      </Box>
      <Text dimColor>↑/↓ เลื่อน · p เปิด/ปิด preview</Text>
    </Box>
  );
}

function resolveOptionModel(option: ModelOption | undefined, activeProviderId: string): string | undefined {
  if (!option) return undefined;
  if (option.value === NO_PREFERENCE) {
    const providerManager = ProviderManager.getInstance();
    const entry = getProviderRegistryEntry(activeProviderId as any);
    return (
      providerManager.getModelForProvider(activeProviderId as any) ?? entry?.defaultModel ?? getDefaultMainLoopModel()
    );
  }
  if (option.modelId) return parseUserSpecifiedModel(option.modelId);
  return parseUserSpecifiedModel(option.value);
}

function EffortLevelIndicator({ effort }: { effort: EffortLevel | undefined }): React.ReactNode {
  return <Text color={effort ? 'claude' : 'subtle'}>{effortLevelToSymbol(effort ?? 'low')}</Text>;
}

function cycleEffortLevel(current: EffortLevel, direction: 'left' | 'right', includeMax: boolean): EffortLevel {
  const levels: EffortLevel[] = includeMax ? ['low', 'medium', 'high', 'max'] : ['low', 'medium', 'high'];
  // If the current level isn't in the cycle (e.g. 'max' after switching to a
  // non-Opus model), clamp to 'high'.
  const idx = levels.indexOf(current);
  const currentIndex = idx !== -1 ? idx : levels.indexOf('high');
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!;
  }
  return levels[(currentIndex - 1 + levels.length) % levels.length]!;
}

function getDefaultEffortLevelForOption(option: ModelOption | undefined, activeProviderId: string): EffortLevel {
  const resolved = resolveOptionModel(option, activeProviderId) ?? getDefaultMainLoopModel();
  const defaultValue = getDefaultEffortForModel(resolved);
  return defaultValue !== undefined ? convertEffortValueToLevel(defaultValue) : 'high';
}
