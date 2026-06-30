import type { AgentDefinition } from 'src/tools/AgentTool/builtInAgents.js';

/**
 * Stub for coordinator worker agent registration.
 *
 * In upstream Claude Code, coordinator mode supplies custom agent definitions
 * for worker orchestration. This fork does not include coordinator mode —
 * the coordinatorMode module gates all paths behind feature('COORDINATOR_MODE').
 */

export function getCoordinatorAgents(): AgentDefinition[] {
  return [];
}
