/**
 * Built-in Plugin Initialization
 *
 * Initializes built-in plugins that ship with the CLI and appear in the
 * /plugin UI for users to enable/disable.
 *
 * Not all bundled features should be built-in plugins — use this for
 * features that users should be able to explicitly enable/disable. For
 * features with complex setup or automatic-enabling logic (e.g.
 * claude-in-chrome), use src/skills/bundled/ instead.
 *
 * To add a new built-in plugin:
 * 1. Import registerBuiltinPlugin from '../builtinPlugins.js'
 * 2. Call registerBuiltinPlugin() with the plugin definition here
 */

/**
 * Initialize built-in plugins. Called during CLI startup.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { HooksSettings } from '../../utils/settings/types.js';
import { registerBuiltinPlugin } from '../builtinPlugins.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const upstreamPluginsRoot = resolve(process.env.CLEW_CODE_UPSTREAM_PLUGINS_DIR ?? join(repoRoot, 'plugins'));

function pluginPath(name: string): string {
  return join(upstreamPluginsRoot, name);
}

function loadHooks(pluginRoot: string): HooksSettings | undefined {
  const hooksPath = join(pluginRoot, 'hooks/hooks.json');
  if (!existsSync(hooksPath)) return undefined;

  const parsed = JSON.parse(readFileSync(hooksPath, 'utf8')) as {
    hooks?: HooksSettings;
  };
  return parsed.hooks;
}

function registerUpstreamPlugin(options: {
  name: string;
  description: string;
  version?: string;
  commands?: boolean;
  agents?: boolean;
  skills?: boolean;
  hooks?: boolean;
  defaultEnabled?: boolean;
}): void {
  const root = pluginPath(options.name);
  if (!existsSync(root)) return;

  registerBuiltinPlugin({
    name: options.name,
    description: options.description,
    version: options.version ?? '1.0.0',
    path: root,
    commandsPath: options.commands ? join(root, 'commands') : undefined,
    agentsPath: options.agents ? join(root, 'agents') : undefined,
    skillsPath: options.skills ? join(root, 'skills') : undefined,
    hooks: options.hooks ? loadHooks(root) : undefined,
    defaultEnabled: options.defaultEnabled ?? true,
  });
}

export function initBuiltinPlugins(): void {
  registerUpstreamPlugin({
    name: 'commit-commands',
    description: 'Git workflow commands for committing, pushing, and creating pull requests',
    commands: true,
  });

  registerUpstreamPlugin({
    name: 'code-review',
    description: 'Pull request code review command from upstream Claude Code',
    commands: true,
  });

  registerUpstreamPlugin({
    name: 'feature-dev',
    description: 'Feature development workflow with explorer, architect, and reviewer agents',
    commands: true,
    agents: true,
  });

  registerUpstreamPlugin({
    name: 'frontend-design',
    description: 'Frontend design skill for UI and UX implementation',
    skills: true,
  });

  registerUpstreamPlugin({
    name: 'security-guidance',
    description: 'Security reminder hook for file editing tools from upstream Claude Code',
    hooks: true,
    defaultEnabled: false,
  });
}
