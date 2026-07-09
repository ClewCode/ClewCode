// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import addDir from './commands/add-dir/index.js';
import autofixPr from './commands/autofix-pr/index.js';
import btw from './commands/btw/index.js';
import feedback from './commands/feedback/index.js';
import clear from './commands/clear/index.js';
import color from './commands/color/index.js';
import copy from './commands/copy/index.js';
import desktop from './commands/desktop/index.js';
import compact from './commands/compact/index.js';
import cd from './commands/cd/index.js';
import codeReview from './commands/code-review/index.js';
import config from './commands/config/index.js';
import { context, contextNonInteractive } from './commands/context/index.js';
import cost from './commands/cost/index.js';
import diff from './commands/diff/index.js';
import doctor from './commands/doctor/index.js';
import memory, { memorySearch } from './commands/memory/index.js';
import explorer from './commands/explorer/index.js';
import help from './commands/help/index.js';
import ide from './commands/ide/index.js';
import init from './commands/init.js';
import keybindings from './commands/keybindings/index.js';

import installGitHubApp from './commands/install-github-app/index.js';
import installSlackApp from './commands/install-slack-app/index.js';
import mcp from './commands/mcp/index.js';
import swarmCmd from './commands/peer/index.js';
import pr_comments from './commands/pr_comments/index.js';
import releaseNotes from './commands/release-notes/index.js';
import rename from './commands/rename/index.js';
import resume from './commands/resume/index.js';
import review, { ultrareview } from './commands/review.js';
import session from './commands/session/index.js';
import skills from './commands/skills/index.js';
import status from './commands/status/index.js';
import tasks from './commands/tasks/index.js';
import teamOnboarding from './commands/team-onboarding/index.js';
import teamDashboard from './commands/team/index.js';
import providerSelect from './commands/provider-select/index.js';
import ruleCmd from './commands/rule/index.js';
import securityReview from './commands/security-review.js';
import terminalSetup from './commands/terminalSetup/index.js';
import usage from './commands/usage/index.js';
import theme from './commands/theme/index.js';
import workspace from './commands/workspace/index.js';
import { feature } from 'bun:bundle';
// Dead code elimination: conditional imports
/* eslint-disable @typescript-eslint/no-require-imports */
// Feature-gated commands (enable via env vars/defines: KAIROS=1 VOICE_MODE=1 BRIDGE_MODE=1)
// Default commands (always available):
const buddy = require('./commands/buddy/index.js').default;

// Feature-gated (require env var):
const _hasFeature = (name: string): boolean => process.env[name] === '1';

const proactive = null;
const briefCommand = _hasFeature('KAIROS')
  ? (require('./commands/brief.ts') as typeof import('./commands/brief.ts')).default
  : null;
const assistantCommand = _hasFeature('KAIROS')
  ? (require('./commands/assistant/assistant.js') as typeof import('./commands/assistant/assistant.js')).default
  : null;
const bridge = _hasFeature('BRIDGE_MODE')
  ? (require('./commands/bridge/index.ts') as typeof import('./commands/bridge/index.ts')).default
  : null;
const remoteControlServerCommand = null;
const voiceCommand = (require('./commands/voice/index.ts') as typeof import('./commands/voice/index.ts')).default;
const webCmd = null;
const clearSkillIndexCache = null;
const ultracode = (require('./commands/ultracode/index.ts') as typeof import('./commands/ultracode/index.ts')).default;
const workflow = (require('./commands/workflow/index.ts') as typeof import('./commands/workflow/index.ts')).default;
const torch = null;
const workflowsCmd = null;
const forkCmd = null;
/* eslint-enable @typescript-eslint/no-require-imports */
import thinkback from './commands/thinkback/index.js';
import thinkbackPlay from './commands/thinkback-play/index.js';
import toolsCmd from './commands/tools/index.js';
import permissions from './commands/permissions/index.js';
import plan from './commands/plan/index.js';
import research from './commands/research/index.js';

import passes from './commands/passes/index.js';
import privacySettings from './commands/privacy-settings/index.js';
import hooks from './commands/hooks/index.js';
import files from './commands/files/index.js';
import branch from './commands/branch/index.js';
import fork from './commands/fork/index.js';
import plugin from './commands/plugin/index.js';
import reloadPlugins from './commands/reload-plugins/index.js';
import rewind from './commands/rewind/index.js';
import recap from './commands/recap/index.js';
import heapDump from './commands/heapdump/index.js';
import remoteCmd from './commands/remote/index.js';
import guardianCmd from './commands/guardian/index.js';
import approveCmd from './commands/approve/index.js';
import prCmd from './commands/pr/index.js';
import sandboxToggle from './commands/sandbox-toggle/index.js';

import chrome from './commands/chrome/index.js';
import stickers from './commands/stickers/index.js';
import goal from './commands/goal/index.js';
import bg from './commands/bg/index.js';
import daemonCmd from './commands/daemon/index.js';
import dashboard from './commands/dashboard/index.js';
import taskCmd from './commands/task/index.js';
import scrollSpeed from './commands/scroll-speed/index.js';
import pluginDetails from './commands/plugin-details/index.js';
import advisor from './commands/advisor.js';
import agentCmd from './commands/agent/index.js';
import capabilities from './commands/capabilities/index.js';

import { logError } from './utils/log.js';
import { toError } from './utils/errors.js';
import { logForDebugging } from './utils/debug.js';
import { getSkillDirCommands, clearSkillCaches, getDynamicSkills } from './skills/loadSkillsDir.js';
import { getBundledSkills } from './skills/bundledSkills.js';
import { getBuiltinPluginSkillCommands } from './plugins/builtinPlugins.js';
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache,
} from './utils/plugins/loadPluginCommands.js';
import memoize from 'lodash-es/memoize.js';
import { isUsing3PServices, isClaudeAISubscriber } from './utils/auth.js';
import { isFirstPartyAnthropicBaseUrl } from './utils/model/providers.js';
import exit from './commands/exit/index.js';
import exportCommand from './commands/export/index.js';
import model from './commands/model/index.js';
import agentConfig from './commands/agent-config/index.js';
import outputStyle from './commands/output-style/index.js';
import skill from './commands/skill/index.js';
import powerup from './commands/powerup/index.js';
import remoteEnv from './commands/remote-env/index.js';
import upgrade from './commands/upgrade/index.js';
import { usageCredits, usageCreditsNonInteractive } from './commands/usage-credits/index.js';
import rateLimitOptions from './commands/rate-limit-options/index.js';

import effort from './commands/effort/index.js';
import stats from './commands/stats/index.js';
// insights.ts is 113KB (3200 lines, includes diffLines/html rendering). Lazy
// shim defers the heavy module until /insights is actually invoked.
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: 'Generate a report analyzing your Clew Code sessions',
  contentLength: 0,
  progressMessage: 'analyzing your sessions',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./commands/insights.js')).default;
    if (real.type !== 'prompt') throw new Error('unreachable');
    return real.getPromptForCommand(args, context);
  },
};
import { getSettingSourceName } from './utils/settings/constants.js';
import { type Command, getCommandName, isCommandEnabled } from './types/command.js';

// Re-export types from the centralized location
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js';
export { getCommandName, isCommandEnabled } from './types/command.js';

// Declared as a function so that we don't run this until getCommands is called,
// since underlying functions read from config, which can't be read at module initialization time
const COMMANDS = memoize((): Command[] => [
  addDir,
  workspace,
  advisor,
  agentCmd,
  autofixPr,
  bg,
  branch,
  fork,
  btw,
  capabilities,
  cd,
  chrome,
  clear,
  codeReview,
  color,
  compact,
  config,
  copy,
  desktop,
  context,
  contextNonInteractive,
  cost,
  daemonCmd,
  dashboard,
  diff,
  doctor,
  effort,
  exit,
  explorer,
  files,
  goal,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  installGitHubApp,
  installSlackApp,
  mcp,
  memory,
  memorySearch,
  model,
  agentConfig,
  outputStyle,
  swarmCmd,
  skill,
  powerup,
  providerSelect,
  remoteEnv,
  plugin,
  pluginDetails,
  pr_comments,
  recap,
  releaseNotes,
  reloadPlugins,
  rename,
  resume,
  session,
  skills,
  stats,
  status,
  taskCmd,
  stickers,
  theme,
  feedback,
  scrollSpeed,
  review,
  ultrareview,
  ultracode,
  rewind,
  ruleCmd,
  securityReview,
  terminalSetup,
  upgrade,
  usageCredits,
  usageCreditsNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  teamOnboarding,
  teamDashboard,
  workflow,
  ...(webCmd ? [webCmd] : []),
  ...(forkCmd ? [forkCmd] : []),
  buddy,
  ...(proactive ? [proactive] : []),
  ...(briefCommand ? [briefCommand] : []),
  ...(assistantCommand ? [assistantCommand] : []),
  ...(bridge ? [bridge] : []),
  ...(remoteControlServerCommand ? [remoteControlServerCommand] : []),
  ...(voiceCommand ? [voiceCommand] : []),
  thinkback,
  thinkbackPlay,
  toolsCmd,
  permissions,
  plan,
  research,
  remoteCmd,
  guardianCmd,
  approveCmd,
  prCmd,
  privacySettings,
  hooks,
  exportCommand,
  sandboxToggle,
  passes,
  tasks,
  ...(workflowsCmd ? [workflowsCmd] : []),
  ...(torch ? [torch] : []),
]);

export const builtInCommandNames = memoize(
  (): Set<string> => new Set(COMMANDS().flatMap(_ => [_.name, ...(_.aliases ?? [])])),
);

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[];
  pluginSkills: Command[];
  bundledSkills: Command[];
  builtinPluginSkills: Command[];
}> {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch(err => {
        logError(toError(err));
        logForDebugging('Skill directory commands failed to load, continuing without them');
        return [];
      }),
      getPluginSkills().catch(err => {
        logError(toError(err));
        logForDebugging('Plugin skills failed to load, continuing without them');
        return [];
      }),
    ]);
    // Bundled skills are registered synchronously at startup
    const bundledSkills = getBundledSkills();
    // Built-in plugin skills come from enabled built-in plugins
    const builtinPluginSkills = getBuiltinPluginSkillCommands();
    logForDebugging(
      `getSkills returning: ${skillDirCommands.length} skill dir commands, ${pluginSkills.length} plugin skills, ${bundledSkills.length} bundled skills, ${builtinPluginSkills.length} builtin plugin skills`,
    );
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    };
  } catch (err) {
    // This should never happen since we catch at the Promise level, but defensive
    logError(toError(err));
    logForDebugging('Unexpected error in getSkills, returning empty');
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    };
  }
}

/**
 * Filters commands by their declared `availability` (auth/provider requirement).
 * Commands without `availability` are treated as universal.
 * This runs before `isEnabled()` so that provider-gated commands are hidden
 * regardless of feature-flag state.
 *
 * Not memoized — auth state can change mid-session (e.g. after /login),
 * so this must be re-evaluated on every getCommands() call.
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true;
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true;
        break;
      case 'console':
        // Console API key user = direct 1P API customer (not 3P, not claude.ai).
        // Excludes 3P (Bedrock/Vertex/Foundry) who don't set ANTHROPIC_BASE_URL
        // and gateway users who proxy through a custom base URL.
        if (!isClaudeAISubscriber() && !isUsing3PServices() && isFirstPartyAnthropicBaseUrl()) return true;
        break;
      default: {
        const _exhaustive: never = a;
        void _exhaustive;
        break;
      }
    }
  }
  return false;
}

/**
 * Loads all command sources (skills, plugins, workflows). Memoized by cwd
 * because loading is expensive (disk I/O, dynamic imports).
 */
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [{ skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills }, pluginCommands, workflowCommands] =
    await Promise.all([getSkills(cwd), getPluginCommands(), Promise.resolve([])]);
  const builtinCommands = COMMANDS();
  const priorityBuiltinCommands = builtinCommands.filter(cmd => cmd.name === 'code-review');
  const remainingBuiltinCommands = builtinCommands.filter(cmd => cmd.name !== 'code-review');

  return [
    ...priorityBuiltinCommands,
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...remainingBuiltinCommands,
  ];
});

/**
 * Returns commands available to the current user. The expensive loading is
 * memoized, but availability and isEnabled checks run fresh every call so
 * auth changes (e.g. /login) take effect immediately.
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd);

  // Get dynamic skills discovered during file operations
  const dynamicSkills = getDynamicSkills();

  // Build base commands without dynamic skills
  const baseCommands = allCommands.filter(_ => meetsAvailabilityRequirement(_) && isCommandEnabled(_));

  if (dynamicSkills.length === 0) {
    return baseCommands;
  }

  // Dedupe dynamic skills - only add if not already present
  const baseCommandNames = new Set(baseCommands.map(c => c.name));
  const uniqueDynamicSkills = dynamicSkills.filter(
    s => !baseCommandNames.has(s.name) && meetsAvailabilityRequirement(s) && isCommandEnabled(s),
  );

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands;
  }

  // Insert dynamic skills after plugin skills but before built-in commands
  const builtInNames = new Set(COMMANDS().map(c => c.name));
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name));

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills];
  }

  return [...baseCommands.slice(0, insertIndex), ...uniqueDynamicSkills, ...baseCommands.slice(insertIndex)];
}

/**
 * Clears only the memoization caches for commands, WITHOUT clearing skill caches.
 * Use this when dynamic skills are added to invalidate cached command lists.
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.();
  getSkillToolCommands.cache?.clear?.();
  getSlashCommandToolSkills.cache?.clear?.();
  // getSkillIndex in skillSearch/localSearch.ts is a separate memoization layer
  // built ON TOP of getSkillToolCommands/getCommands. Clearing only the inner
  // caches is a no-op for the outer — lodash memoize returns the cached result
  // without ever reaching the cleared inners. Must clear it explicitly.
  clearSkillIndexCache?.();
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches();
  clearPluginCommandCache();
  clearPluginSkillsCache();
  clearSkillCaches();
}

/**
 * Filter AppState.mcp.commands to MCP-provided skills (prompt-type,
 * model-invocable, loaded from MCP). These live outside getCommands() so
 * callers that need MCP skills in their skill index thread them through
 * separately.
 */
export function getMcpSkillCommands(mcpCommands: readonly Command[]): readonly Command[] {
  if (feature('MCP_SKILLS')) {
    return mcpCommands.filter(cmd => cmd.type === 'prompt' && cmd.loadedFrom === 'mcp' && !cmd.disableModelInvocation);
  }
  return [];
}

// SkillTool shows ALL prompt-based commands that the model can invoke
// This includes both skills (from /skills/) and commands (from /commands/)
export const getSkillToolCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const allCommands = await getCommands(cwd);
  return allCommands.filter(
    cmd =>
      cmd.type === 'prompt' &&
      !cmd.disableModelInvocation &&
      cmd.source !== 'builtin' &&
      // Always include skills from /skills/ dirs, bundled skills, and legacy /commands/ entries
      // (they all get an auto-derived description from the first line if frontmatter is missing).
      // Plugin/MCP commands still require an explicit description to appear in the listing.
      (cmd.loadedFrom === 'bundled' ||
        cmd.loadedFrom === 'skills' ||
        cmd.loadedFrom === 'commands_DEPRECATED' ||
        cmd.hasUserSpecifiedDescription ||
        cmd.whenToUse),
  );
});

// Filters commands to include only skills. Skills are commands that provide
// specialized capabilities for the model to use. They are identified by
// loadedFrom being 'skills', 'plugin', or 'bundled', or having disableModelInvocation set.
export const getSlashCommandToolSkills = memoize(async (cwd: string): Promise<Command[]> => {
  try {
    const allCommands = await getCommands(cwd);
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.source !== 'builtin' &&
        (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
        (cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'plugin' ||
          cmd.loadedFrom === 'bundled' ||
          cmd.disableModelInvocation),
    );
  } catch (error) {
    logError(toError(error));
    // Return empty array rather than throwing - skills are non-critical
    // This prevents skill loading failures from breaking the entire system
    logForDebugging('Returning empty skills array due to load failure');
    return [];
  }
});

/**
 * Commands that are safe to use in remote mode (--remote).
 * These only affect local TUI state and don't depend on local filesystem,
 * git, shell, IDE, MCP, or other local execution context.
 *
 * Used in two places:
 * 1. Pre-filtering commands in main.tsx before REPL renders (prevents race with CCR init)
 * 2. Preserving local-only commands in REPL's handleRemoteInit after CCR filters
 */
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, // Shows QR code / URL for remote session
  exit, // Exit the TUI
  clear, // Clear screen
  help, // Show help
  theme, // Change terminal theme
  color, // Change agent color
  cost, // Show session cost (local cost tracking)
  usage, // Show usage info
  stats, // Show usage statistics
  copy, // Copy last message
  btw, // Quick note
  feedback, // Send feedback
  plan, // Plan mode toggle
  keybindings, // Keybinding management

  stickers, // Stickers
]);

/**
 * Builtin commands of type 'local' that ARE safe to execute when received
 * over the Remote Control bridge. These produce text output that streams
 * back to the mobile/web client and have no terminal-only side effects.
 *
 * 'local-jsx' commands are blocked by type (they render Ink UI) and
 * 'prompt' commands are allowed by type (they expand to text sent to the
 * model) — this set only gates 'local' commands.
 *
 * When adding a new 'local' command that should work from mobile, add it
 * here. Default is blocked.
 */
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [
    compact, // Shrink context — useful mid-session from a phone
    clear, // Wipe transcript
    cost, // Show session cost
    releaseNotes, // Show changelog
    files, // List tracked files
  ].filter((c): c is Command => c !== null),
);

/**
 * Whether a slash command is safe to execute when its input arrived over the
 * Remote Control bridge (mobile/web client).
 *
 * PR #19134 blanket-blocked all slash commands from bridge inbound because
 * `/model` from iOS was popping the local Ink picker. This predicate relaxes
 * that with an explicit allowlist: 'prompt' commands (skills) expand to text
 * and are safe by construction; 'local' commands need an explicit opt-in via
 * BRIDGE_SAFE_COMMANDS; 'local-jsx' commands render Ink UI and stay blocked.
 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return false;
  if (cmd.type === 'prompt') return true;
  return BRIDGE_SAFE_COMMANDS.has(cmd);
}

/**
 * Filter commands to only include those safe for remote mode.
 * Used to pre-filter commands when rendering the REPL in --remote mode,
 * preventing local-only commands from being briefly available before
 * the CCR init message arrives.
 */
export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => REMOTE_SAFE_COMMANDS.has(cmd));
}

export function findCommand(commandName: string, commands: Command[]): Command | undefined {
  // E26: Try exact match first (name, registered name, aliases)
  const exact = commands.find(
    _ => _.name === commandName || getCommandName(_) === commandName || _.aliases?.includes(commandName),
  );
  if (exact) return exact;

  // E26 / H7: Fall back to prefix match so "term" matches "terminal-setup"
  const prefixMatch = commands.find(
    _ =>
      _.name.startsWith(commandName) ||
      getCommandName(_).startsWith(commandName) ||
      _.aliases?.some(a => a.startsWith(commandName)),
  );
  if (prefixMatch) return prefixMatch;

  // H7: Plugin commands with spaces (e.g. "/myplugin review") should resolve
  // to their namespaced form (e.g. "myplugin:review"). Try replacing the first
  // space with ":" as a fallback.
  const colonSepIdx = commandName.indexOf(' ');
  if (colonSepIdx > 0) {
    const withColon = `${commandName.slice(0, colonSepIdx)}:${commandName.slice(colonSepIdx + 1)}`;
    return findCommand(withColon, commands);
  }

  return undefined;
}

export function hasCommand(commandName: string, commands: Command[]): boolean {
  return findCommand(commandName, commands) !== undefined;
}

export function getCommand(commandName: string, commands: Command[]): Command {
  const command = findCommand(commandName, commands);
  if (!command) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands
        .map(_ => {
          const name = getCommandName(_);
          return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name;
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    );
  }

  return command;
}

/**
 * Formats a command's description with its source annotation for user-facing UI.
 * Use this in typeahead, help screens, and other places where users need to see
 * where a command comes from.
 *
 * For model-facing prompts (like SkillTool), use cmd.description directly.
 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.type !== 'prompt') {
    return cmd.description;
  }

  if (cmd.kind === 'workflow') {
    return `${cmd.description} (workflow)`;
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name;
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`;
    }
    return `${cmd.description} (plugin)`;
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description;
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description} (bundled)`;
  }

  return `${cmd.description} (${getSettingSourceName(cmd.source)})`;
}
