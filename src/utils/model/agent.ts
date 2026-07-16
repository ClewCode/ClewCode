import { PROVIDER_REGISTRY } from '../../services/ai/providerRegistry.js';
import type { PermissionMode } from '../permissions/PermissionMode.js';
import { getSettings_DEPRECATED } from '../settings/settings.js';
import { capitalize } from '../stringUtils.js';
import { MODEL_ALIASES } from './aliases.js';
import { applyBedrockRegionPrefix, getBedrockRegionPrefix } from './bedrock.js';
import { getCanonicalName, getRuntimeMainLoopModel, parseUserSpecifiedModel } from './model.js';
import { isModelAllowed } from './modelAllowlist.js';
import { getAPIProvider } from './providers.js';

// ── Provider-aware defaults for agent subagent model resolution ──

export const AGENT_MODEL_OPTIONS = [...MODEL_ALIASES, 'inherit'] as const;
export type AgentModelAlias = (typeof AGENT_MODEL_OPTIONS)[number];

export type AgentModelOption = {
  value: AgentModelAlias;
  label: string;
  description: string;
};

/**
 * Resolve the effective default subagent model from a configured value and
 * optional environment override.
 */
export function resolveSubagentDefaultModel(
  configuredModel?: string,
  envModel = process.env.CLEW_CODE_SUBAGENT_MODEL,
): string {
  if (envModel && isModelAllowed(envModel)) {
    return envModel;
  }
  if (configuredModel && isModelAllowed(configuredModel)) {
    return configuredModel;
  }
  return 'inherit';
}

/**
 * Get the user-configured default subagent model, if any.
 * Returns undefined when no explicit default is configured or the configured
 * value is disallowed by the current model allowlist.
 */
export function getUserSpecifiedSubagentModelSetting(): string | undefined {
  const settings = getSettings_DEPRECATED() || {};
  const resolved = resolveSubagentDefaultModel(settings.subagentModel, process.env.CLEW_CODE_SUBAGENT_MODEL);
  return resolved === 'inherit' ? undefined : resolved;
}

/**
 * Get the default subagent model. Returns 'inherit' when the user has not set
 * an explicit subagent default.
 */
export function getDefaultSubagentModel(): string {
  return getUserSpecifiedSubagentModelSetting() ?? 'inherit';
}

/**
 * Get the user-configured default subagent provider, if any.
 * Returns undefined when no explicit default is configured.
 */
export function getUserSpecifiedSubagentProvider(): string | undefined {
  const settings = getSettings_DEPRECATED() || {};
  return settings.subagentProvider || undefined;
}

/**
 * Get the user-configured default subagent permission mode, if any.
 * Returns undefined when no explicit default is configured.
 */
export function getUserSpecifiedSubagentPermissionMode(): string | undefined {
  const settings = getSettings_DEPRECATED() || {};
  return settings.subagentPermissionMode || undefined;
}

/**
 * Get the effective model string for an agent.
 *
 * For non-Anthropic providers, alias models (sonnet/opus/haiku) resolve to the
 * active provider's best/default model instead of a Claude model ID, preventing
 * "Model claude-sonnet-4-7 is not supported" errors when the active provider
 * doesn't serve Anthropic models.
 *
 * For Bedrock, if the parent model uses a cross-region inference prefix (e.g., "eu.", "us."),
 * that prefix is inherited by subagents using alias models (e.g., "sonnet", "haiku", "opus").
 * This ensures subagents use the same region as the parent, which is necessary when
 * IAM permissions are scoped to specific cross-region inference profiles.
 */
export function getAgentModel(
  agentModel: string | undefined,
  parentModel: string,
  toolSpecifiedModel?: AgentModelAlias,
  permissionMode?: PermissionMode,
): string {
  if (toolSpecifiedModel === 'inherit') return parentModel;

  const explicitSubagentModel = getUserSpecifiedSubagentModelSetting();
  if (explicitSubagentModel) {
    return parseUserSpecifiedModel(explicitSubagentModel);
  }

  // Extract Bedrock region prefix from parent model to inherit for subagents.
  // This ensures subagents use the same cross-region inference profile (e.g., "eu.", "us.")
  // as the parent, which is required when IAM permissions only allow specific regions.
  const parentRegionPrefix = getBedrockRegionPrefix(parentModel);

  // Helper to apply parent region prefix for Bedrock models.
  // `originalSpec` is the raw model string before resolution (alias or full ID).
  // If the user explicitly specified a full model ID that already carries its own
  // region prefix (e.g., "eu.anthropic.…"), we preserve it instead of overwriting
  // with the parent's prefix. This prevents silent data-residency violations when
  // an agent config intentionally pins to a different region than the parent.
  const applyParentRegionPrefix = (resolvedModel: string, originalSpec: string): string => {
    if (parentRegionPrefix && getAPIProvider() === 'bedrock') {
      if (getBedrockRegionPrefix(originalSpec)) return resolvedModel;
      return applyBedrockRegionPrefix(resolvedModel, parentRegionPrefix);
    }
    return resolvedModel;
  };

  // Prioritize tool-specified model if provided
  if (toolSpecifiedModel) {
    if (aliasMatchesParentTier(toolSpecifiedModel, parentModel)) {
      return parentModel;
    }
    // For non-Anthropic providers, resolve alias to the provider's best/default model
    const providerModel = resolveAliasForProvider(toolSpecifiedModel);
    if (providerModel) {
      return applyParentRegionPrefix(providerModel, toolSpecifiedModel);
    }
    const model = parseUserSpecifiedModel(toolSpecifiedModel);
    return applyParentRegionPrefix(model, toolSpecifiedModel);
  }

  const agentModelWithExp = agentModel ?? getDefaultSubagentModel();

  if (agentModelWithExp === 'inherit') {
    // Apply runtime model resolution for inherit to get the effective model
    // This ensures agents using 'inherit' get opusplan→Opus resolution in plan mode
    return getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? 'default',
      mainLoopModel: parentModel,
      exceeds200kTokens: false,
    });
  }

  if (aliasMatchesParentTier(agentModelWithExp, parentModel)) {
    return parentModel;
  }
  // For non-Anthropic providers, resolve alias to the provider's best/default model
  const providerModel = resolveAliasForProvider(agentModelWithExp);
  if (providerModel) {
    return applyParentRegionPrefix(providerModel, agentModelWithExp);
  }
  const model = parseUserSpecifiedModel(agentModelWithExp);
  return applyParentRegionPrefix(model, agentModelWithExp);
}

/**
 * Resolve an alias (sonnet/opus/haiku/best) against the active provider's
 * model registry when the provider is non-Anthropic. Returns undefined for
 * Anthropic-class providers so existing alias resolution works unchanged.
 */
function resolveAliasForProvider(alias: string): string | undefined {
  const provider = getAPIProvider();
  // Only apply for non-Anthropic providers (skip firstParty, bedrock, vertex, foundry)
  if (provider === 'firstParty' || provider === 'bedrock' || provider === 'vertex' || provider === 'foundry') {
    return undefined;
  }
  const entry = (PROVIDER_REGISTRY as Record<string, any>)[provider];
  if (!entry) return undefined;

  const lowerAlias = alias.toLowerCase();
  switch (lowerAlias) {
    case 'opus':
    case 'best':
      return entry.bestModel ?? entry.defaultModel ?? undefined;
    case 'sonnet':
      return entry.defaultModel ?? entry.bestModel ?? entry.smallFastModel ?? undefined;
    case 'haiku':
      return entry.smallFastModel ?? entry.defaultModel ?? undefined;
    default:
      return undefined;
  }
}

/**
 * Check if a bare family alias (opus/sonnet/haiku) matches the parent model's
 * tier. When it does, the subagent inherits the parent's exact model string
 * instead of resolving the alias to a provider default.
 *
 * Prevents surprising downgrades: a Vertex user on Opus 4.6 (via /model) who
 * spawns a subagent with `model: opus` should get Opus 4.6, not whatever
 * getDefaultOpusModel() returns for 3P.
 * See https://github.com/anthropics/claude-code/issues/30815.
 *
 * Only bare family aliases match. `opus[1m]`, `best`, `opusplan` fall through
 * since they carry semantics beyond "same tier as parent".
 */
function aliasMatchesParentTier(alias: string, parentModel: string): boolean {
  const canonical = getCanonicalName(parentModel);
  switch (alias.toLowerCase()) {
    case 'opus':
      return canonical.includes('opus');
    case 'sonnet':
      return canonical.includes('sonnet');
    case 'haiku':
      return canonical.includes('haiku');
    default:
      return false;
  }
}

export function getAgentModelDisplay(model: string | undefined): string {
  // When model is omitted, use the configured subagent default for display.
  if (!model) {
    const defaultModel = getDefaultSubagentModel();
    return defaultModel === 'inherit' ? 'Inherit from parent (default)' : `Default subagent model (${defaultModel})`;
  }
  if (model === 'inherit') return 'Inherit from parent';
  return capitalize(model);
}

/**
 * Get available model options for agents
 */
export function getAgentModelOptions(): AgentModelOption[] {
  return [
    {
      value: 'sonnet',
      label: 'Sonnet',
      description: 'Balanced performance - best for most agents',
    },
    {
      value: 'opus',
      label: 'Opus',
      description: 'Most capable for complex reasoning tasks',
    },
    {
      value: 'haiku',
      label: 'Haiku',
      description: 'Fast and efficient for simple tasks',
    },
    {
      value: 'inherit',
      label: 'Inherit from parent',
      description: 'Use the same model as the main conversation',
    },
  ];
}
