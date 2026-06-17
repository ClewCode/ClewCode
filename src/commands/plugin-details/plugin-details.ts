import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

/**
 * /plugin-details command — show detailed info about an installed plugin.
 *
 * Usage:
 *   /plugin-details <plugin-name>
 *
 * Shows component inventory (skills, commands, hooks, MCP servers, agents)
 * and projected per-session token cost (G23, G31).
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const pluginName = args?.trim();

  if (!pluginName) {
    onDone(`Usage: /plugin-details <plugin-name>\n\nInstalled plugins:\n${getInstalledPluginsList(context)}`, {
      display: 'system',
    });
    return null;
  }

  const state = context.getAppState();
  const allPlugins = [...(state.plugins?.enabled ?? []), ...(state.plugins?.disabled ?? [])];
  const plugin = allPlugins.find(
    p =>
      p.name.toLowerCase() === pluginName.toLowerCase() ||
      p.manifest?.displayName?.toLowerCase() === pluginName.toLowerCase(),
  );

  if (!plugin) {
    onDone(`Plugin "${pluginName}" not found. Check /plugin list for available plugins.`, { display: 'system' });
    return null;
  }

  const lines: string[] = [];
  lines.push(`Plugin: ${plugin.manifest?.displayName ?? plugin.name}`);
  lines.push(`Name: ${plugin.name}`);
  lines.push(`Status: ${plugin.enabled !== false ? 'enabled' : 'disabled'}`);
  lines.push(`Source: ${plugin.source}`);
  lines.push(`Repository: ${plugin.repository}`);
  lines.push(`Version: ${plugin.manifest?.version ?? 'N/A'}`);
  lines.push(`Description: ${plugin.manifest?.description ?? 'N/A'}`);
  lines.push('');

  // ── Component Inventory ──────────────────────────────────────────
  lines.push('── Component Inventory ──');
  lines.push('');

  // Skills
  const skillCount =
    (plugin.skills?.length ?? 0) +
    (plugin.skillsPaths?.length ?? 0) +
    (plugin.commandsPaths?.filter(p => p.endsWith('.md')).length ?? 0);
  lines.push(`  Skills: ${skillCount}`);
  if (plugin.skillsPaths && plugin.skillsPaths.length > 0) {
    for (const p of plugin.skillsPaths) lines.push(`    - ${p}`);
  }

  // Commands
  const commandPaths = [...(plugin.commandsPath ? [plugin.commandsPath] : []), ...(plugin.commandsPaths ?? [])];
  if (commandPaths.length > 0) {
    lines.push(`  Commands: ${commandPaths.length}`);
    for (const cmd of commandPaths) lines.push(`    - ${cmd}`);
  }

  // Agents
  const agentPaths = [...(plugin.agentsPath ? [plugin.agentsPath] : []), ...(plugin.agentsPaths ?? [])];
  if (agentPaths.length > 0) {
    lines.push(`  Agents: ${agentPaths.length}`);
    for (const a of agentPaths) lines.push(`    - ${a}`);
  }

  // Hooks — show event names cleanly (G31)
  if (plugin.hooksConfig) {
    const hookEntries = Object.entries(plugin.hooksConfig);
    lines.push(`  Hooks: ${hookEntries.length} event(s)`);
    for (const [event, matchers] of hookEntries) {
      if (matchers && matchers.length > 0) {
        for (const matcher of matchers) {
          const hookType = matcher.type === 'command' ? 'command' : (matcher.type ?? 'prompt');
          const hookDetail =
            matcher.type === 'command'
              ? ((matcher as any).command ?? (matcher as any).hooks?.[0]?.command ?? '')
              : ((matcher as any).prompt?.slice(0, 60) ?? '');
          lines.push(`    - ${event} [${hookType}]${hookDetail ? `: ${hookDetail}` : ''} (${matcher.matcher ?? '*'})`);
        }
      }
    }
  } else {
    lines.push('  Hooks: none');
  }

  // MCP servers — show name + type + status (G31)
  if (plugin.mcpServers) {
    const mcpEntries = Object.entries(plugin.mcpServers);
    lines.push(`  MCP servers: ${mcpEntries.length}`);
    for (const [name, server] of mcpEntries) {
      const typeLabel = server.type ?? 'stdio';
      const transportInfo = server.url ?? server.command ?? '';
      lines.push(`    - ${name} (${typeLabel})${transportInfo ? ` → ${transportInfo}` : ''}`);
    }
  } else {
    lines.push('  MCP servers: none');
  }

  // ── Cost Estimate (G23) ──────────────────────────────────────────
  lines.push('');
  lines.push('── Cost Estimate ──');
  lines.push('');

  // Rough per-session token estimates
  // Skills: ~50 tokens each (name + description + whenToUse)
  // Commands: ~30 tokens each
  // MCP schemas: ~100 tokens per server
  // Hooks: ~40 tokens each
  // Agents: ~60 tokens each
  let totalEstimate = 0;

  const estSkills = skillCount * 50;
  totalEstimate += estSkills;
  lines.push(`  Skill prompts: ~${estSkills} tokens`);

  const estCommands = commandPaths.length * 30;
  totalEstimate += estCommands;
  if (commandPaths.length > 0) lines.push(`  Command schemas: ~${estCommands} tokens`);

  const estAgents = agentPaths.length * 60;
  totalEstimate += estAgents;
  if (agentPaths.length > 0) lines.push(`  Agent definitions: ~${estAgents} tokens`);

  const mcpCount = plugin.mcpServers ? Object.keys(plugin.mcpServers).length : 0;
  const estMcp = mcpCount * 100;
  totalEstimate += estMcp;
  if (mcpCount > 0) lines.push(`  MCP tool schemas: ~${estMcp} tokens`);

  const hookCount = plugin.hooksConfig ? Object.keys(plugin.hooksConfig).length : 0;
  const estHooks = hookCount * 40;
  totalEstimate += estHooks;
  if (hookCount > 0) lines.push(`  Hook configs: ~${estHooks} tokens`);

  lines.push(`  ─────────────────────`);
  lines.push(`  Total: ~${totalEstimate} tokens/session (estimated)`);

  if (plugin.manifest?.cost) {
    const cost = plugin.manifest.cost;
    lines.push(`  Listed cost: ${typeof cost === 'string' ? cost : JSON.stringify(cost)}`);
  }

  lines.push('');
  lines.push('Use /reload-plugins after installing or updating plugins.');

  onDone(lines.join('\n'), { display: 'system' });
  return null;
}

function getInstalledPluginsList(context: ToolUseContext & LocalJSXCommandContext): string {
  const state = context.getAppState();
  const enabled = state.plugins?.enabled ?? [];
  const disabled = state.plugins?.disabled ?? [];

  if (enabled.length === 0 && disabled.length === 0) {
    return '  (no plugins installed)';
  }

  const lines: string[] = [];
  if (enabled.length > 0) {
    lines.push(`  Enabled (${enabled.length}):`);
    for (const p of enabled) {
      lines.push(`    - ${p.manifest?.displayName ?? p.name}`);
    }
  }
  if (disabled.length > 0) {
    lines.push(`  Disabled (${disabled.length}):`);
    for (const p of disabled) {
      lines.push(`    - ${p.manifest?.displayName ?? p.name}`);
    }
  }
  return lines.join('\n');
}
