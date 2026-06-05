// Clew taste-1: Integration adapters for existing hook/prompt/tool systems

import type { Taste1Runtime } from './core/Taste1Runtime.js';
import { DEFAULT_TASTE1_CONFIG, type Taste1Config } from './core/Taste1Types.js';

/**
 * Integration adapters for taste-1.
 *
 * Integration points (some are no-op stubs where the hook doesn't exist yet):
 *
 * 1. Prompt injection → hook into system context via getSystemContext() / getUserContext()
 *    Add taste context block to system prompt before query.
 *    Implemented: injectTasteContext()
 *
 * 2. Edit validation → PreAcceptEdit hook
 *    Validate edits against symbolic rules before accepting.
 *    No-op stub: this repo's PreAcceptEdit hook is not exposed as a simple callback.
 *    Documented: validateEdit()
 *
 * 3. Accept/reject signals → PostToolUse hook or tool result
 *    Track accept/reject from user approval dialogs.
 *    No-op stub: tool approval flow is internal to the permission system.
 *    Documented: recordAccept(), recordReject()
 *
 * 4. Test/lint signals → PostToolUse hook
 *    Track test/lint outcomes from bash tool output.
 *    No-op stub: test/lint signal parsing requires output analysis.
 *    Documented: onToolResult()
 *
 * 5. Config → settings.json taste1 section
 *    Implemented: loadConfigFromSettings()
 */

export function loadConfigFromSettings(settings?: Record<string, unknown>): Partial<Taste1Config> {
  if (!settings?.taste1 || typeof settings.taste1 !== 'object') return {};
  const t = settings.taste1 as Record<string, unknown>;
  return {
    enabled: typeof t.enabled === 'boolean' ? t.enabled : DEFAULT_TASTE1_CONFIG.enabled,
    autoLearn: typeof t.autoLearn === 'boolean' ? t.autoLearn : DEFAULT_TASTE1_CONFIG.autoLearn,
    injectPrompts: typeof t.injectPrompts === 'boolean' ? t.injectPrompts : DEFAULT_TASTE1_CONFIG.injectPrompts,
    validateEdits: typeof t.validateEdits === 'boolean' ? t.validateEdits : DEFAULT_TASTE1_CONFIG.validateEdits,
    minConfidence: typeof t.minConfidence === 'number' ? t.minConfidence : DEFAULT_TASTE1_CONFIG.minConfidence,
    maxInjectedRules:
      typeof t.maxInjectedRules === 'number' ? t.maxInjectedRules : DEFAULT_TASTE1_CONFIG.maxInjectedRules,
    decayEnabled: typeof t.decayEnabled === 'boolean' ? t.decayEnabled : DEFAULT_TASTE1_CONFIG.decayEnabled,
    banditEnabled: typeof t.banditEnabled === 'boolean' ? t.banditEnabled : DEFAULT_TASTE1_CONFIG.banditEnabled,
    neuralScoringEnabled:
      typeof t.neuralScoringEnabled === 'boolean' ? t.neuralScoringEnabled : DEFAULT_TASTE1_CONFIG.neuralScoringEnabled,
  };
}

/**
 * Inject taste context into the system prompt.
 * Call this from the query/prompt building pipeline.
 *
 * Integration point: add `tasteContext` to the systemContext object
 * returned by getSystemContext() or as an additional section in getUserContext().
 */
export function getTasteInjectionBlock(runtime: Taste1Runtime): string | null {
  if (!runtime.isEnabled()) return null;
  return runtime.getInjectedPrompt();
}

/**
 * Validate an edit before accepting it.
 * This is designed to be called from the PreAcceptEdit hook.
 *
 * Currently returns null (no block) because the hook is not wired.
 * To connect: call this from PreAcceptEdit handler when taste1.validateEdits is true.
 */
export function validateEdit(
  runtime: Taste1Runtime,
  _before: string,
  after: string,
): { shouldBlock: boolean; reason?: string } | null {
  if (!runtime.isEnabled()) return null;
  const config = runtime.getConfig();
  if (!config.validateEdits) return null;

  const decision = runtime.evaluateOutput(after);
  if (decision.shouldBlock) {
    return {
      shouldBlock: true,
      reason: decision.reason ?? 'Edit violates learned preferences',
    };
  }
  return { shouldBlock: false };
}

/**
 * Record an accept signal.
 * Call this from the tool approval flow when the user accepts.
 */
export async function recordAcceptSignal(runtime: Taste1Runtime, prompt?: string, filePaths?: string[]): Promise<void> {
  if (!runtime.isEnabled()) return;
  await runtime.recordAccept(prompt, filePaths);
}

/**
 * Record a reject signal.
 * Call this from the tool approval flow when the user rejects.
 */
export async function recordRejectSignal(runtime: Taste1Runtime, prompt?: string, filePaths?: string[]): Promise<void> {
  if (!runtime.isEnabled()) return;
  await runtime.recordReject(prompt, filePaths);
}

/**
 * Record a tool result for learning.
 * Call this from PostToolUse hook.
 */
export async function recordToolSignal(runtime: Taste1Runtime, success: boolean, toolName?: string): Promise<void> {
  if (!runtime.isEnabled()) return;
  await runtime.recordToolResult(success, toolName);
}
