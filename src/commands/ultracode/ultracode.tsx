import {
  createInitialUltracodeState,
  disableUltracode,
  enableUltracode,
  markConfirmed,
  type UltracodeState,
} from '../../agentRuntime/ultracode.js';
import { tryAutoRunDynamicWorkflow } from '../../agentRuntime/ultracodeBridge.js';
import { getSessionId } from '../../bootstrap/state.js';
import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';
import { getCwd } from '../../utils/cwd.js';

const ULTRACODE_STATE_KEY = 'ultracodeState';

function readState(): UltracodeState {
  const appState = (globalThis as { __appState?: { get?: (k: string) => unknown } }).__appState;
  const raw = appState?.get?.(ULTRACODE_STATE_KEY);
  if (raw && typeof raw === 'object' && 'enabled' in raw) {
    return raw as UltracodeState;
  }
  return createInitialUltracodeState();
}

function writeState(state: UltracodeState): void {
  const appState = (globalThis as { __appState?: { set?: (k: string, v: unknown) => void } }).__appState;
  appState?.set?.(ULTRACODE_STATE_KEY, state);
}

/**
 * `/ultracode` slash command.
 *
 *   /ultracode           — show current status
 *   /ultracode on        — turn on ultracode (auto-trigger dynamic workflows)
 *   /ultracode off       — turn off
 *   /ultracode status    — show current state
 *   /ultracode confirm   — mark the first-run cost confirmation as accepted
 *   /ultracode reset     — clear confirmation + workflow counter
 *   /ultracode run <p>   — explicitly plan and execute a dynamic workflow for <p>
 */
export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const [verbRaw, ...rest] = trimmed.split(/\s+/);
  const verb = (verbRaw || '').toLowerCase();
  const current = readState();

  if (verb === '' || verb === 'status' || verb === 'show') {
    return { type: 'text', value: renderStatus(current) };
  }

  if (verb === 'on' || verb === 'enable') {
    const next = enableUltracode(current);
    writeState(next);
    return {
      type: 'text',
      value:
        `${next.enabled ? '◈ ultracode ON' : '◈ ultracode OFF'} · effort is xhigh; Claude may spin up ` +
        'a dynamic workflow for complex tasks. First run will ask for confirmation.',
    };
  }

  if (verb === 'off' || verb === 'disable') {
    const next = disableUltracode(current);
    writeState(next);
    return { type: 'text', value: '◈ ultracode OFF · dynamic workflows disabled for this session.' };
  }

  if (verb === 'confirm') {
    const next = markConfirmed(current);
    writeState(next);
    return { type: 'text', value: '◈ ultracode · first-run cost warning accepted for this session.' };
  }

  if (verb === 'reset') {
    const fresh = createInitialUltracodeState();
    writeState(fresh);
    return { type: 'text', value: '◈ ultracode · state reset (confirmation + counter cleared).' };
  }

  if (verb === 'run') {
    const prompt = rest.join(' ').trim();
    if (!prompt) {
      return { type: 'text', value: 'Usage: /ultracode run <prompt>' };
    }

    const outcome = await tryAutoRunDynamicWorkflow({
      prompt,
      workspaceRoot: getCwd(),
      sessionId: getSessionId(),
      explicitlyRequested: true,
    });

    switch (outcome.kind) {
      case 'ran':
        return { type: 'text', value: outcome.message.message.content.map(block => block.text).join('\n') };
      case 'cancelled':
        return { type: 'text', value: `◈ ultracode · workflow cancelled: ${outcome.reason}` };
      case 'suggested':
        return { type: 'text', value: outcome.message };
      case 'not-triggered':
        return { type: 'text', value: `◈ ultracode · workflow could not start: ${outcome.reason}` };
    }
  }

  return {
    type: 'text',
    value:
      'Usage:\n' +
      '  /ultracode              show status\n' +
      '  /ultracode on|off       toggle ultracode for this session\n' +
      '  /ultracode confirm      accept the first-run cost warning\n' +
      '  /ultracode reset        clear confirmation + workflow counter\n' +
      '  /ultracode run <prompt> plan and execute a dynamic workflow for <prompt>',
  };
}

function renderStatus(state: UltracodeState): string {
  const flag = state.enabled ? 'ON ' : 'OFF';
  return [
    `◈ ultracode: ${flag}`,
    '   effort:        xhigh (auto)',
    `   workflows run: ${state.workflowsStarted}`,
    `   first-run ack: ${state.confirmedOnce ? 'yes' : 'no (will ask on first workflow)'}`,
  ].join('\n');
}
