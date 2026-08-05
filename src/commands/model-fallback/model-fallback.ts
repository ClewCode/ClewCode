import ansis from 'ansis';
import type { LocalCommandCall } from '../../types/command.js';
import { EFFORT_LEVELS, type EffortLevel } from '../../utils/effort.js';
import {
  addFallbackEntry,
  clearFallbackChain,
  type FallbackEntry,
  getModelFallbackChain,
  moveFallbackEntry,
  removeFallbackEntry,
} from '../../utils/model/fallbackChain.js';

function renderEntry(entry: FallbackEntry, index: number): string {
  const provider = entry.provider ? `${entry.provider}/` : '';
  const effort = entry.effort ? ansis.dim(` · ${entry.effort} effort`) : '';
  return `  ${ansis.dim(`${index}.`)} ${ansis.bold(provider + entry.model)}${effort}`;
}

function renderChain(): string {
  const chain = getModelFallbackChain();
  if (chain.length === 0) {
    return [
      'No fallback chain configured.',
      '',
      ansis.dim('Add one with: /model-fallback add <provider|-> <model> [effort]'),
      ansis.dim('Example:      /model-fallback add - claude-haiku-4-5 low'),
    ].join('\n');
  }
  return [
    `Fallback chain (${chain.length} ${chain.length === 1 ? 'entry' : 'entries'}), tried in order:`,
    ...chain.map(renderEntry),
    '',
    ansis.dim('Entries pinned to a different provider than the active one are skipped'),
    ansis.dim('during a retry and only apply from the next query onward.'),
  ].join('\n');
}

function text(value: string): { type: 'text'; value: string } {
  return { type: 'text', value };
}

function error(message: string): { type: 'text'; value: string } {
  return text(`${ansis.red('Error:')} ${message}`);
}

function parseIndex(raw: string | undefined, chainLength: number, label: string): number | string {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= chainLength) {
    return `${label} must be an integer between 0 and ${chainLength - 1}.`;
  }
  return n;
}

export const call: LocalCommandCall = async args => {
  const parts = (args ?? '').trim().split(/\s+/).filter(Boolean);
  const [subcommand, ...rest] = parts;

  if (!subcommand) {
    return text(renderChain());
  }

  switch (subcommand) {
    case 'add': {
      const [providerArg, model, effortArg] = rest;
      if (!model) {
        return error('Usage: /model-fallback add <provider|-> <model> [effort]');
      }
      if (effortArg && !(EFFORT_LEVELS as readonly string[]).includes(effortArg)) {
        return error(`Unknown effort '${effortArg}'. Valid: ${EFFORT_LEVELS.join(', ')}.`);
      }
      const entry: FallbackEntry = {
        // '-' means "no provider pin": use whatever provider is active.
        ...(providerArg && providerArg !== '-' ? { provider: providerArg } : {}),
        model,
        ...(effortArg ? { effort: effortArg as EffortLevel } : {}),
      };
      addFallbackEntry(entry);
      return text(`Added to fallback chain:\n${renderEntry(entry, getModelFallbackChain().length - 1)}`);
    }

    case 'remove': {
      const chain = getModelFallbackChain();
      if (chain.length === 0) return error('Fallback chain is already empty.');
      const index = parseIndex(rest[0], chain.length, 'Index');
      if (typeof index === 'string') return error(index);
      const removed = chain[index]!;
      removeFallbackEntry(index);
      return text(`Removed ${ansis.bold((removed.provider ? `${removed.provider}/` : '') + removed.model)}.`);
    }

    case 'move': {
      const chain = getModelFallbackChain();
      if (chain.length < 2) return error('Need at least two entries to reorder.');
      const from = parseIndex(rest[0], chain.length, 'Source index');
      if (typeof from === 'string') return error(from);
      const to = parseIndex(rest[1], chain.length, 'Destination index');
      if (typeof to === 'string') return error(to);
      moveFallbackEntry(from, to);
      return text(renderChain());
    }

    case 'clear': {
      clearFallbackChain();
      return text('Fallback chain cleared.');
    }

    default:
      return error(`Unknown subcommand '${subcommand}'. Use add, remove, move, or clear.`);
  }
};
