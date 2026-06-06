import * as React from 'react';
import { useEffect, useState } from 'react';
import { type PlannerLlm, planDynamicWorkflow } from '../../agentRuntime/dynamicWorkflow.js';
import {
  createInitialUltracodeState,
  disableUltracode,
  enableUltracode,
  formatConfirmationPrompt,
  markConfirmed,
  recordWorkflowStart,
  shouldRequestConfirmation,
  type UltracodeState,
} from '../../agentRuntime/ultracode.js';
import { Box, Text, useInput } from '../../ink.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';

const ULTRACODE_STATE_KEY = 'ultracodeState';

function readState(): UltracodeState {
  // AppState is the natural home for session-scoped toggles like ultracode.
  // We persist via a dedicated key so the rest of the app can subscribe to
  // it without polluting the global state shape.
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
 *   /ultracode run <p>   — explicitly plan a dynamic workflow for prompt <p>
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
    return { type: 'skip' };
  }

  return {
    type: 'text',
    value:
      'Usage:\n' +
      '  /ultracode              show status\n' +
      '  /ultracode on|off       toggle ultracode for this session\n' +
      '  /ultracode confirm      accept the first-run cost warning\n' +
      '  /ultracode reset        clear confirmation + workflow counter\n' +
      '  /ultracode run <prompt> plan a dynamic workflow for <prompt>',
  };
}

function renderStatus(state: UltracodeState): string {
  const flag = state.enabled ? 'ON ' : 'OFF';
  const lines = [
    `◈ ultracode: ${flag}`,
    `   effort:        xhigh (auto)`,
    `   workflows run: ${state.workflowsStarted}`,
    `   first-run ack: ${state.confirmedOnce ? 'yes' : 'no (will ask on first workflow)'}`,
  ];
  return lines.join('\n');
}

/**
 * Build a confirmation prompt for a planned dynamic workflow. Exposed so
 * other commands (e.g. a `/workflow` command) can reuse the same UI.
 */
export function buildConfirmationMessage(workflow: {
  subtasks: { role: string; id: string }[];
  estimatedTokenCost: string;
  rationale: string;
}): string {
  return formatConfirmationPrompt(workflow as Parameters<typeof formatConfirmationPrompt>[0]);
}

export { recordWorkflowStart, shouldRequestConfirmation };

// ─────────────────────────────────────────────────────────────────────────────
// Interactive flow: pick a prompt, see the planned workflow, accept/cancel.
// Host code wires `plannerLlm` in via a global so we don't have to thread it
// through the command loader. If it's not set we fall back to a dry-run
// preview that shows what *would* be planned.
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveUltracodeFlow({
  prompt,
  plannerLlm,
  onDone,
}: {
  prompt: string;
  plannerLlm?: PlannerLlm;
  onDone: (result: LocalCommandResult) => void;
}): React.ReactNode {
  const [phase, setPhase] = useState<'planning' | 'confirm' | 'done'>('planning');
  const [plan, setPlan] = useState<Parameters<typeof formatConfirmationPrompt>[0] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!plannerLlm) {
      // Dry-run preview when no LLM is wired up (e.g. tests, offline)
      setPlan({
        subtasks: [
          { id: 'a', role: 'researcher' as const, title: 'A', prompt: '...', dependsOn: [], effort: 2 },
          { id: 'b', role: 'verifier' as const, title: 'B', prompt: '...', dependsOn: [], effort: 1 },
        ],
        estimatedTokenCost: 'medium',
        rationale: '(preview — no LLM wired up)',
      });
      setPhase('confirm');
      return;
    }
    planDynamicWorkflow(prompt, plannerLlm)
      .then(p => {
        if (cancelled) return;
        setPlan(p);
        setPhase('confirm');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('done');
        onDone({ type: 'text', value: `◈ ultracode · failed to plan: ${e instanceof Error ? e.message : String(e)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [prompt, plannerLlm, onDone]);

  useInput((_input, key) => {
    if (phase !== 'confirm') return;
    if (key.return) {
      writeState(markConfirmed(recordWorkflowStart(enableUltracode(readState()))));
      setPhase('done');
      onDone({ type: 'text', value: '◈ ultracode · workflow accepted and started.' });
    } else if (key.escape || _input === 'n') {
      setPhase('done');
      onDone({ type: 'text', value: '◈ ultracode · workflow cancelled.' });
    } else if (_input === 'y') {
      writeState(markConfirmed(recordWorkflowStart(enableUltracode(readState()))));
      setPhase('done');
      onDone({ type: 'text', value: '◈ ultracode · workflow accepted and started.' });
    }
  });

  if (error) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="red">◈ ultracode error: {error}</Text>
      </Box>
    );
  }

  if (phase === 'planning') {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="gray">◈ ultracode · planning dynamic workflow…</Text>
      </Box>
    );
  }

  if (phase === 'confirm' && plan) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>{formatConfirmationPrompt(plan)}</Text>
      </Box>
    );
  }

  return null;
}

// Optional: wire this into the AppState store (best-effort, no-op outside host)
export function bootstrapUltracodeState(): void {
  try {
    const current = readState();
    if (!current) writeState(createInitialUltracodeState());
  } catch {
    // Silently no-op: ultracode state is optional; the app must still work
    // without it.
  }
}

// Hook for components that need to subscribe to ultracode state.
export function useUltracodeState(): [UltracodeState, (next: UltracodeState) => void] {
  const state = useAppState(s => (s as Record<string, unknown>)[ULTRACODE_STATE_KEY] as UltracodeState | undefined);
  const setAppState = useSetAppState();
  const value = state ?? createInitialUltracodeState();
  const setValue = React.useCallback(
    (next: UltracodeState) => {
      setAppState(prev => ({ ...prev, [ULTRACODE_STATE_KEY]: next }));
      writeState(next);
    },
    [setAppState],
  );
  return [value, setValue];
}
