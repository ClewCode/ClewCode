import type { Command } from '../../commands.js';

/**
 * Check if agent view is disabled via settings, environment variable, or non-TTY.
 * Called by the entrypoint before opening agent view.
 * Returns a reason string if disabled, or null if enabled.
 */
export function getAgentViewDisabledReason(): string | null {
  if (!process.stdin.isTTY) return 'not available in non-TTY mode (run in an interactive terminal)';
  if (process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW === 'true' || process.env.CLAUDE_CODE_DISABLE_AGENT_VIEW === '1') {
    return 'disabled by CLAUDE_CODE_DISABLE_AGENT_VIEW environment variable';
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

const agentsCmd: Command = {
  type: 'local-jsx',
  name: 'agents',
  description: 'AI Agents: monitor sessions, manage definitions, and control the agent runtime',
  isEnabled: () => getAgentViewDisabledReason() === null,
  load: () => import('./agents.js'),
};

export default agentsCmd;
