import ansis from 'ansis';
import type { LocalCommandCall } from '../../types/command.js';
import { EFFORT_LEVELS, type EffortLevel } from '../../utils/effort.js';
import {
  getRouterConfig,
  type RouterEntry,
  setRouterEntry,
  type TaskMode,
  unsetRouterEntry,
} from '../../utils/model/router.js';

const TASK_MODES = ['code', 'ask', 'debug', 'orchestrator', 'plan'] as const satisfies readonly TaskMode[];

// Mirrors inferTaskModeFromPermissionMode() — shown so users can see which
// permission mode actually activates each route.
const MODE_SOURCE: Record<TaskMode, string> = {
  code: 'default, acceptEdits',
  ask: 'ask',
  debug: 'dontAsk',
  orchestrator: 'bypassPermissions, auto',
  plan: 'plan',
};

function isTaskMode(value: string): value is TaskMode {
  return (TASK_MODES as readonly string[]).includes(value);
}

function renderRoutes(): string {
  const config = getRouterConfig();
  const lines = TASK_MODES.map(mode => {
    const entry = config[mode];
    const target = entry
      ? ansis.bold((entry.provider ? `${entry.provider}/` : '') + entry.model) +
        (entry.effort ? ansis.dim(` · ${entry.effort} effort`) : '')
      : ansis.dim('(unset — uses the default model)');
    return `  ${ansis.bold(mode.padEnd(13))} ${target}\n${' '.repeat(16)}${ansis.dim(`from permission mode: ${MODE_SOURCE[mode]}`)}`;
  });
  return [
    'Task-mode routing:',
    ...lines,
    '',
    ansis.dim('An explicit /model choice for the session always overrides routing.'),
    ansis.dim('Set a route with: /model-router set <mode> <provider|-> <model> [effort]'),
  ].join('\n');
}

function text(value: string): { type: 'text'; value: string } {
  return { type: 'text', value };
}

function error(message: string): { type: 'text'; value: string } {
  return text(`${ansis.red('Error:')} ${message}`);
}

export const call: LocalCommandCall = async args => {
  const parts = (args ?? '').trim().split(/\s+/).filter(Boolean);
  const [subcommand, ...rest] = parts;

  if (!subcommand) {
    return text(renderRoutes());
  }

  switch (subcommand) {
    case 'set': {
      const [mode, providerArg, model, effortArg] = rest;
      if (!mode || !model) {
        return error('Usage: /model-router set <mode> <provider|-> <model> [effort]');
      }
      if (!isTaskMode(mode)) {
        return error(`Unknown mode '${mode}'. Valid: ${TASK_MODES.join(', ')}.`);
      }
      if (effortArg && !(EFFORT_LEVELS as readonly string[]).includes(effortArg)) {
        return error(`Unknown effort '${effortArg}'. Valid: ${EFFORT_LEVELS.join(', ')}.`);
      }
      const entry: RouterEntry = {
        // '-' means "no provider pin": use whatever provider is active.
        ...(providerArg && providerArg !== '-' ? { provider: providerArg } : {}),
        model,
        ...(effortArg ? { effort: effortArg as EffortLevel } : {}),
      };
      setRouterEntry(mode, entry);
      return text(`Routed ${ansis.bold(mode)} to ${ansis.bold(model)}${effortArg ? ` at ${effortArg} effort` : ''}.`);
    }

    case 'unset': {
      const [mode] = rest;
      if (!mode) return error('Usage: /model-router unset <mode>');
      if (!isTaskMode(mode)) {
        return error(`Unknown mode '${mode}'. Valid: ${TASK_MODES.join(', ')}.`);
      }
      if (!getRouterConfig()[mode]) {
        return error(`No route configured for '${mode}'.`);
      }
      unsetRouterEntry(mode);
      return text(`Cleared the route for ${ansis.bold(mode)}.`);
    }

    default:
      return error(`Unknown subcommand '${subcommand}'. Use set or unset.`);
  }
};
