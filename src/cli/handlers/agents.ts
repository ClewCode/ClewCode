/**
 * Agents subcommand handler — prints the list of configured agents.
 * Dynamically imported only when `claude agents` runs.
 */

import {
  AGENT_SOURCE_GROUPS,
  compareAgentsByName,
  getOverrideSourceLabel,
  type ResolvedAgent,
  resolveAgentModelDisplay,
  resolveAgentOverrides,
} from '../../tools/AgentTool/agentDisplay.js';
import { getActiveAgentsFromList, getAgentDefinitionsWithOverrides } from '../../tools/AgentTool/loadAgentsDir.js';
import { getCwd } from '../../utils/cwd.js';
import { listSessionsJsonCommand } from '../sessionManager.js';

/**
 * Check if agent view is disabled via settings, environment variable, or non-TTY.
 * Called by the entrypoint before opening agent view.
 * Returns a reason string if disabled, or null if enabled.
 */
export function getAgentViewDisabledReason(): string | null {
  if (!process.stdin.isTTY) return 'not available in non-TTY mode (run in an interactive terminal)';
  if (process.env.CLEW_CODE_DISABLE_AGENT_VIEW === 'true' || process.env.CLEW_CODE_DISABLE_AGENT_VIEW === '1') {
    return 'disabled by CLEW_CODE_DISABLE_AGENT_VIEW environment variable';
  }
  return null;
}

/**
 * Check if agent view is disabled via settings or environment variable.
 * @deprecated Use getAgentViewDisabledReason() for detailed gate information.
 */
export function isAgentViewDisabled(): boolean {
  return getAgentViewDisabledReason() !== null;
}

function formatAgent(agent: ResolvedAgent): string {
  const model = resolveAgentModelDisplay(agent);
  const parts = [agent.agentType];
  if (model) {
    parts.push(model);
  }
  if (agent.memory) {
    parts.push(`${agent.memory} memory`);
  }
  return parts.join(' · ');
}

export async function agentsHandler(options?: { json?: boolean }): Promise<void> {
  if (options?.json) {
    await listSessionsJsonCommand();
    return;
  }

  // Check agent view gate before listing agents
  const reason = getAgentViewDisabledReason();
  if (reason) {
    console.log(`Agent view is ${reason}.`);
    return;
  }

  const cwd = getCwd();
  const { allAgents } = await getAgentDefinitionsWithOverrides(cwd);
  const activeAgents = getActiveAgentsFromList(allAgents);
  const resolvedAgents = resolveAgentOverrides(allAgents, activeAgents);

  const lines: string[] = [];
  let totalActive = 0;

  for (const { label, source } of AGENT_SOURCE_GROUPS) {
    const groupAgents = resolvedAgents.filter(a => a.source === source).sort(compareAgentsByName);

    if (groupAgents.length === 0) continue;

    lines.push(`${label}:`);
    for (const agent of groupAgents) {
      if (agent.overriddenBy) {
        const winnerSource = getOverrideSourceLabel(agent.overriddenBy);
        lines.push(`  (shadowed by ${winnerSource}) ${formatAgent(agent)}`);
      } else {
        lines.push(`  ${formatAgent(agent)}`);
        totalActive++;
      }
    }
    lines.push('');
  }

  if (lines.length === 0) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('No agents found.');
  } else {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`${totalActive} active agents\n`);
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(lines.join('\n').trimEnd());
  }
}
