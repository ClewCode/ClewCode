/**
 * `/guardian` slash command — toggle guardian auto-review mode.
 *
 * Guardian mode routes sandbox-boundary approval requests to a separate
 * LLM reviewer agent instead of pausing for the user. Includes a circuit
 * breaker that interrupts the turn after 3 consecutive denials.
 *
 * Subcommands:
 *   on|off          Toggle guardian mode
 *   status          Show current state + circuit breaker info
 *   policy          Show current guardian policy
 *   policy --set <text>  Set custom policy
 *   reset           Reset circuit breaker counter
 */

import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';
import { createDenialTrackingState, resetGuardianBreaker } from '../../utils/permissions/denialTracking.js';

// Guardian state stored on globalThis for now (like remote server)
const GLOBAL_KEY = '__guardianState';

type GuardianState = {
  enabled: boolean;
  denialState: ReturnType<typeof createDenialTrackingState>;
};

function getState(): GuardianState {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { enabled: false, denialState: createDenialTrackingState() };
  }
  return g[GLOBAL_KEY];
}

function setEnabled(v: boolean): void {
  const s = getState();
  s.enabled = v;
}

export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const [verb, ...rest] = trimmed.split(/\s+/);
  const v = (verb ?? '').toLowerCase();

  switch (v) {
    case 'on':
    case 'enable':
      setEnabled(true);
      return {
        type: 'text',
        value:
          '◈ guardian ON · auto-review enabled. Boundary-crossing actions will be reviewed by a Guardian agent.\n  Use /guardian off to disable.\n  Use /approve to override denials.',
      };

    case 'off':
    case 'disable':
      setEnabled(false);
      return {
        type: 'text',
        value: '◈ guardian OFF · auto-review disabled. Falling back to standard permission mode.',
      };

    case 'status': {
      const s = getState();
      const ds = s.denialState;
      const lines = [
        `◈ guardian: ${s.enabled ? 'ON' : 'OFF'}`,
        `  consecutive denials: ${ds.consecutiveDenials} / 3`,
        `  total denials:       ${ds.totalDenials}`,
        `  guardian reviews:    ${ds.guardianTotalReviews}`,
        `  window denials:      ${ds.guardianDenialsInWindow} / 10 (last 50)`,
      ];
      return { type: 'text', value: lines.join('\n') };
    }

    case 'policy': {
      const policyArg = rest.join(' ').trim();
      if (policyArg.startsWith('--set')) {
        const policyText = policyArg.slice(5).trim();
        if (!policyText) {
          return { type: 'text', value: 'Usage: /guardian policy --set "your policy text"' };
        }
        (globalThis as any).__guardianPolicy = policyText;
        return { type: 'text', value: '◈ guardian · custom policy set.' };
      }

      // Show current policy
      const current = (globalThis as any).__guardianPolicy || '(built-in default)';
      return { type: 'text', value: `◈ guardian · policy:\n${current}` };
    }

    case 'reset': {
      const s = getState();
      s.denialState = resetGuardianBreaker(s.denialState);
      return { type: 'text', value: '◈ guardian · circuit breaker reset.' };
    }

    default:
      return {
        type: 'text',
        value:
          'Usage:\n' +
          '  /guardian on|off       Toggle guardian auto-review mode\n' +
          '  /guardian status       Show guardian state + circuit breaker\n' +
          '  /guardian policy       Show current policy\n' +
          '  /guardian policy --set "..."  Set custom policy\n' +
          '  /guardian reset        Reset circuit breaker counter',
      };
  }
}
