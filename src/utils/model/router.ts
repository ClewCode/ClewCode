import type { EffortLevel } from '../effort.js';
import type { PermissionMode } from '../permissions/PermissionMode.js';
import { getInitialSettings, updateSettingsForSource } from '../settings/settings.js';

export type TaskMode = 'code' | 'ask' | 'debug' | 'orchestrator' | 'plan';

export type RouterEntry = {
  provider?: string; // omitted = active provider
  model: string;
  effort?: EffortLevel;
};

/**
 * Infer the task mode from a PermissionMode.
 * This is a judgment call since PermissionMode wasn't designed to represent task type.
 *
 * Mapping:
 * - 'plan' → 'plan' (explicit plan mode)
 * - 'bypassPermissions' / 'auto' → 'orchestrator' (coordinating multiple agents)
 * - 'acceptEdits' / 'default' → 'code' (typical interactive coding)
 * - 'ask' → 'ask' (question/answer mode)
 * - 'dontAsk' → 'debug' (debug/diagnostic mode, no user prompts)
 *
 * @param mode The permission mode
 * @returns The inferred task mode
 */
export function inferTaskModeFromPermissionMode(mode: PermissionMode | undefined): TaskMode {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'bypassPermissions':
    case 'auto':
      return 'orchestrator';
    case 'acceptEdits':
    case 'default':
    case undefined:
      return 'code';
    case 'ask':
      return 'ask';
    case 'dontAsk':
      return 'debug';
    default:
      // Fallback for unknown modes
      return 'code';
  }
}

/**
 * Get the complete router configuration from settings.
 * @returns The configured per-mode model/effort overrides
 */
export function getRouterConfig(): Partial<Record<TaskMode, RouterEntry>> {
  const settings = getInitialSettings() || {};
  return settings.modelRouter ?? {};
}

/**
 * Set a router entry for a given task mode.
 * @param mode The task mode
 * @param entry The model/effort/provider override for this mode
 */
export function setRouterEntry(mode: TaskMode, entry: RouterEntry): void {
  const router = getRouterConfig();
  const updated: Partial<Record<TaskMode, RouterEntry>> = { ...router, [mode]: entry };
  updateSettingsForSource('userSettings', { modelRouter: updated as any });
}

/**
 * Remove a router entry for a given task mode (unset the override).
 * @param mode The task mode
 */
export function unsetRouterEntry(mode: TaskMode): void {
  const router = getRouterConfig();
  const updated: Partial<Record<TaskMode, RouterEntry>> = { ...router };
  delete updated[mode];
  updateSettingsForSource('userSettings', { modelRouter: updated as any });
}

/**
 * Resolve the router override for the given permission mode, if any.
 * Returns the model/effort override if configured, undefined otherwise.
 *
 * @param permissionMode The current permission mode
 * @returns The router entry for the inferred task mode, or undefined
 */
export function resolveRouterOverride(permissionMode: PermissionMode | undefined): RouterEntry | undefined {
  const taskMode = inferTaskModeFromPermissionMode(permissionMode);
  return getRouterConfig()[taskMode];
}

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';

export interface ComplexityContext {
  filesCount?: number;
  hasDiff?: boolean;
  recentErrorsCount?: number;
  activePermissionMode?: PermissionMode;
}

export interface ComplexityAnalysis {
  complexity: ComplexityLevel;
  suggestedMode: TaskMode;
  suggestedEffort: EffortLevel;
  confidence: number;
  reasons: string[];
}

/**
 * Heuristically classify the complexity of a user prompt or task.
 * Enables dynamic reasoning effort and model scaling.
 */
export function classifyTaskComplexity(prompt: string, context?: ComplexityContext): ComplexityAnalysis {
  const text = prompt.toLowerCase().trim();
  const reasons: string[] = [];
  let score = 0;

  // 1. High complexity keywords (architecture, refactor, concurrency, migrations, benchmarks)
  const complexPatterns = [
    /\b(architect\w*|refactor\w*|migrat\w*|deadlock\w*|race condition\w*|memory leak\w*|concurrency|benchmark\w*|optimiz\w*|bottleneck\w*)\b/i,
    /\b(overhaul\w*|redesign\w*|multi-thread\w*|distributed|vulnerabilit\w*)\b/i,
  ];
  for (const pattern of complexPatterns) {
    if (pattern.test(text)) {
      score += 4;
      reasons.push(`Contains high-complexity architectural/performance term`);
      break;
    }
  }

  // 2. Planning and goal patterns
  if (/\b(plan\w*|design doc|proposal\w*|strategy|roadmap|break down into phases)\b/i.test(text)) {
    score += 3;
    reasons.push('Explicit planning / strategy request');
  }

  // 3. Multi-file or broad context clues
  if (context?.filesCount && context.filesCount > 3) {
    score += 3;
    reasons.push(`Broad working context (${context.filesCount} active files)`);
  }

  // 4. Debugging with errors
  if (context?.recentErrorsCount && context.recentErrorsCount > 0) {
    score += 2;
    reasons.push(`Active error state (${context.recentErrorsCount} errors reported)`);
  }

  // 5. Code modification clues
  if (/\b(fix|bug|error|issue|implement|build|create|add feature|extend|support)\b/i.test(text)) {
    score += 2;
    reasons.push('Contains coding / implementation verbs');
  }

  // 6. Low complexity / trivial cues
  if (
    /\b(explain|what is|how does|why does|where is|summarize|translate|format|rename|docstring|comment)\b/i.test(
      text,
    ) &&
    !patternHasComplex(text)
  ) {
    score -= 2;
    reasons.push('Informational or low-impact documentation inquiry');
  }

  // Very short query or greeting
  if (text.length < 25 && !text.includes('fix') && !text.includes('refactor')) {
    score -= 2;
    reasons.push('Short query');
  }

  // Resolve classification
  let complexity: ComplexityLevel = 'moderate';
  let suggestedEffort: EffortLevel = 'medium';
  let suggestedMode: TaskMode = 'code';

  if (score >= 4) {
    complexity = 'complex';
    suggestedEffort = 'high';
    suggestedMode = text.includes('plan') ? 'plan' : 'code';
  } else if (score >= 1) {
    complexity = 'moderate';
    suggestedEffort = 'medium';
    suggestedMode = context?.activePermissionMode
      ? inferTaskModeFromPermissionMode(context.activePermissionMode)
      : 'code';
  } else if (score >= -1) {
    complexity = 'simple';
    suggestedEffort = 'low';
    suggestedMode = 'code';
  } else {
    complexity = 'trivial';
    suggestedEffort = 'low';
    suggestedMode = 'ask';
  }

  const confidence = Math.min(1.0, Math.max(0.4, 0.5 + Math.abs(score) * 0.1));

  return {
    complexity,
    suggestedMode,
    suggestedEffort,
    confidence,
    reasons,
  };
}

function patternHasComplex(text: string): boolean {
  return /\b(architect|refactor|performance|security|concurrency|benchmark)\b/i.test(text);
}

/**
 * Resolve an adaptive router override combining configured router entries and dynamic prompt complexity.
 */
export function resolveAdaptiveRouterOverride(
  permissionMode: PermissionMode | undefined,
  prompt?: string,
  context?: ComplexityContext,
): RouterEntry | undefined {
  // If user configured a static override for this permission mode, prioritize it
  const configured = resolveRouterOverride(permissionMode);
  if (configured) {
    return configured;
  }

  // If prompt is provided, perform dynamic classification
  if (prompt) {
    const analysis = classifyTaskComplexity(prompt, { ...context, activePermissionMode: permissionMode });
    const configuredForMode = getRouterConfig()[analysis.suggestedMode];
    if (configuredForMode) {
      return {
        ...configuredForMode,
        effort: configuredForMode.effort ?? analysis.suggestedEffort,
      };
    }
  }

  return undefined;
}
