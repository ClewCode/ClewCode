import { GENERAL_PURPOSE_AGENT } from '../tools/AgentTool/built-in/generalPurposeAgent.js';
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js';

/**
 * Built-in worker definitions available to the coordinator.
 *
 * Coordinator mode replaces the normal built-in registry, so it must provide
 * at least the default worker type that AgentTool selects when subagent_type is
 * omitted. Returning an empty list makes every default delegation fail with
 * "Agent type 'general-purpose' not found".
 */
export function getCoordinatorAgents(): AgentDefinition[] {
  return [GENERAL_PURPOSE_AGENT];
}
