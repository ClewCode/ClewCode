// Clew taste: Integration adapters for existing hook/prompt/tool systems
// Also hosts the global TasteRuntime singleton for cross-module access.

import { TasteRuntime } from './core/TasteRuntime.js';
import {
  DEFAULT_TASTE_CONFIG,
  type TasteConfig,
  type TasteFeedbackPriority,
  type TasteRule,
} from './core/TasteTypes.js';

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

let _runtime: TasteRuntime | null = null;
/** External callback for auto-learned rules — wired by the REPL to show toasts */
let _onAutoLearnRule: ((rule: TasteRule) => void) | null = null;
let _onTasteFeedback: ((message: string, key?: string, priority?: TasteFeedbackPriority) => void) | null = null;

/**
 * Get (or lazily create) the global TasteRuntime singleton.
 * The runtime is created with default config; call `initTasteOnStartup` to
 * load persisted settings and async-initialize the profile.
 */
export function getTasteRuntime(): TasteRuntime {
  if (!_runtime) {
    _runtime = new TasteRuntime();
    _runtime.onTasteFeedback = _onTasteFeedback;
  }
  return _runtime;
}

/**
 * Initialize or re-configure the global taste runtime from settings.
 *
 * Call this once at app startup (after settings are loaded) so that:
 *  - taste config from settings.json is applied
 *  - the profile is loaded
 *  - prompt injection / signal collection can work without the user
 *    having to type `/taste` first.
 */
export async function initTasteOnStartup(): Promise<void> {
  const r = getTasteRuntime();

  // Wire up the auto-learn rule callback (for terminal notifications)
  if (_onAutoLearnRule) {
    r.onAutoLearnRule = _onAutoLearnRule;
  }
  r.onTasteFeedback = _onTasteFeedback;

  // Lazy-import settings to avoid circular deps at module level
  const { getInitialSettings } = await import('../../utils/settings/settings.js');
  const settings = getInitialSettings() as Record<string, unknown>;
  const config = loadConfigFromSettings(settings);
  r.updateConfig(config);

  // Async-init (load or create profile)
  if (!r.getProfile().projectId) {
    await r.initialize();
  }

  // Subscribe to live settings changes (e.g. user edits settings.json)
  subscribeToSettingsChanges();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function loadConfigFromSettings(settings?: Record<string, unknown>): Partial<TasteConfig> {
  if (!settings?.taste || typeof settings.taste !== 'object') return {};
  const t = settings.taste as Record<string, unknown>;
  return {
    enabled: typeof t.enabled === 'boolean' ? t.enabled : DEFAULT_TASTE_CONFIG.enabled,
    autoLearn: typeof t.autoLearn === 'boolean' ? t.autoLearn : DEFAULT_TASTE_CONFIG.autoLearn,
    injectPrompts: typeof t.injectPrompts === 'boolean' ? t.injectPrompts : DEFAULT_TASTE_CONFIG.injectPrompts,
    validateEdits: typeof t.validateEdits === 'boolean' ? t.validateEdits : DEFAULT_TASTE_CONFIG.validateEdits,
    minConfidence: typeof t.minConfidence === 'number' ? t.minConfidence : DEFAULT_TASTE_CONFIG.minConfidence,
    maxInjectedRules:
      typeof t.maxInjectedRules === 'number' ? t.maxInjectedRules : DEFAULT_TASTE_CONFIG.maxInjectedRules,
    decayEnabled: typeof t.decayEnabled === 'boolean' ? t.decayEnabled : DEFAULT_TASTE_CONFIG.decayEnabled,
    banditEnabled: typeof t.banditEnabled === 'boolean' ? t.banditEnabled : DEFAULT_TASTE_CONFIG.banditEnabled,
    neuralScoringEnabled:
      typeof t.neuralScoringEnabled === 'boolean' ? t.neuralScoringEnabled : DEFAULT_TASTE_CONFIG.neuralScoringEnabled,
  };
}

// ---------------------------------------------------------------------------
// Prompt injection
// ---------------------------------------------------------------------------

/**
 * Build the taste context block for system-prompt injection.
 *
 * Returns a markdown snippet (or null when taste is disabled / injection off)
 * that should be appended to the system prompt before each query.
 */
export function getTasteInjectionBlock(): string | null {
  const r = getTasteRuntime();
  if (!r.isEnabled()) return null;
  return r.getInjectedPrompt();
}

// ---------------------------------------------------------------------------
// Settings change subscription (live-reload taste config)
// ---------------------------------------------------------------------------

let _settingsUnsubscribe: (() => void) | null = null;

/**
 * Subscribe to runtime settings changes so that taste config is reloaded
 * whenever the user edits settings.json.
 *
 * Call this once during app startup alongside initTasteOnStartup().
 */
export function subscribeToSettingsChanges(): void {
  if (_settingsUnsubscribe) return; // already subscribed

  // Dynamic imports to avoid circular deps at module level
  import('../../utils/settings/changeDetector.js').then(({ subscribe }) => {
    import('../../utils/settings/settings.js').then(({ getSettings }) => {
      _settingsUnsubscribe = subscribe(() => {
        const r = getTasteRuntime();
        const current = getSettings() as Record<string, unknown>;
        const config = loadConfigFromSettings(current);
        r.updateConfig(config);
      });
    });
  });
}

/**
 * Tear down the settings subscription (e.g. during shutdown / testing).
 */
export function unsubscribeFromSettingsChanges(): void {
  _settingsUnsubscribe?.();
  _settingsUnsubscribe = null;
}

// ---------------------------------------------------------------------------
// Auto-learn notification wiring
// ---------------------------------------------------------------------------

/**
 * Set a callback that fires when taste auto-learns and auto-adds a rule.
 * The REPL uses this to show "taste add" toast notifications.
 */
export function setOnTasteAutoLearnRule(cb: ((rule: TasteRule) => void) | null): void {
  _onAutoLearnRule = cb;
  // If runtime already exists, wire it immediately
  if (_runtime) {
    _runtime.onAutoLearnRule = cb;
  }
}

export function setOnTasteFeedback(
  cb: ((message: string, key?: string, priority?: TasteFeedbackPriority) => void) | null,
): void {
  _onTasteFeedback = cb;
  if (_runtime) {
    _runtime.onTasteFeedback = cb;
  }
}

// ---------------------------------------------------------------------------
// Edit validation (PreAcceptEdit hook)
// ---------------------------------------------------------------------------

/**
 * Validate an edit before accepting it.
 * Returns `{ shouldBlock, reason }` or null if validation is disabled.
 */
export function validateEdit(_before: string, after: string): { shouldBlock: boolean; reason?: string } | null {
  const r = getTasteRuntime();
  if (!r.isEnabled()) return null;
  const config = r.getConfig();
  if (!config.validateEdits) return null;

  const decision = r.evaluateOutput(after);
  if (decision.shouldBlock) {
    return {
      shouldBlock: true,
      reason: decision.reason ?? 'Edit violates learned preferences',
    };
  }
  return { shouldBlock: false };
}

// ---------------------------------------------------------------------------
// Signal collection
// ---------------------------------------------------------------------------

/** Record an accept signal (user approved a tool/action). */
export async function recordAcceptSignal(prompt?: string, filePaths?: string[]): Promise<void> {
  const r = getTasteRuntime();
  if (!r.isEnabled()) return;
  await r.recordAccept(prompt, filePaths);
}

/** Record a reject signal (user rejected a tool/action). */
export async function recordRejectSignal(prompt?: string, filePaths?: string[]): Promise<void> {
  const r = getTasteRuntime();
  if (!r.isEnabled()) return;
  await r.recordReject(prompt, filePaths);
}

/** Record a tool result (success/failure + tool name). */
export async function recordToolSignal(success: boolean, toolName?: string): Promise<void> {
  const r = getTasteRuntime();
  if (!r.isEnabled()) return;
  await r.recordToolResult(success, toolName);
}
