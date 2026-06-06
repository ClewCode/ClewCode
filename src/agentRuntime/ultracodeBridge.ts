/**
 * Bridge between the QueryEngine main loop and the dynamic-workflow
 * runner. When ultracode is enabled and the user prompt trips the
 * heuristic, this module plans a workflow, asks for confirmation (first
 * time only), and runs it via the coordinator bridge. The result is
 * returned as a synthetic assistant message that the QueryEngine can
 * prepend to `messages` before the main loop, so the regular model
 * turn sees the workflow output as prior context.
 *
 * The bridge is OPT-IN: every global hook is read lazily from
 * `globalThis`, and if any of them is missing the helper returns
 * `null` and the QueryEngine continues with its normal path. That
 * keeps the integration test-safe and avoids imposing new
 * dependencies on callers that haven't been wired up.
 */

import { randomUUID } from 'node:crypto';
import { type PlannerLlm, planDynamicWorkflow } from './dynamicWorkflow.js';
import { runDynamicWorkflowAsCoordinator } from './dynamicWorkflowCoordinator.js';
import {
  buildUltracodeSuggestion,
  type ClassifierResult,
  classifyTranscript,
  type TranscriptContext,
} from './transcriptClassifier.js';
import { shouldAutoTriggerWorkflow, shouldRequestConfirmation, type UltracodeState } from './ultracode.js';

const ULTRACODE_STATE_KEY = 'ultracodeState';

type GlobalAppState = {
  get?: (k: string) => unknown;
  set?: (k: string, v: unknown) => void;
};

type GlobalHooks = {
  appState?: GlobalAppState;
  plannerLlm?: PlannerLlm;
  agentRunner?: (
    subtask: {
      id: string;
      role: string;
      title: string;
      prompt: string;
      dependsOn: string[];
      verifiedBy?: string;
      effort: number;
    },
    context: string,
  ) => Promise<{ output: string }>;
  /**
   * Async confirmation prompt. Resolves `true` to run, `false` to skip.
   * The default implementation auto-confirms when not wired up (tests)
   * or when the user has already accepted once in this session.
   */
  confirm?: (params: {
    summary: string;
    workflow: { subtasks: { role: string; id: string }[]; estimatedTokenCost: string; rationale: string };
  }) => Promise<boolean>;
};

function readHooks(): GlobalHooks {
  const g = globalThis as {
    __appState?: GlobalAppState;
    __ultracodePlannerLlm?: PlannerLlm;
    __ultracodeAgentRunner?: GlobalHooks['agentRunner'];
    __ultracodeConfirm?: GlobalHooks['confirm'];
  };
  return {
    appState: g.__appState,
    plannerLlm: g.__ultracodePlannerLlm,
    agentRunner: g.__ultracodeAgentRunner,
    confirm: g.__ultracodeConfirm,
  };
}

function readUltracodeState(hooks: GlobalHooks): UltracodeState {
  const raw = hooks.appState?.get?.(ULTRACODE_STATE_KEY);
  if (raw && typeof raw === 'object' && 'enabled' in raw) {
    return raw as UltracodeState;
  }
  return { enabled: false, confirmedOnce: false, workflowsStarted: 0 };
}

function writeUltracodeState(hooks: GlobalHooks, next: UltracodeState): void {
  hooks.appState?.set?.(ULTRACODE_STATE_KEY, next);
}

export type AutoWorkflowOutcome =
  | { kind: 'not-triggered'; reason: string; classifier?: ClassifierResult }
  | { kind: 'cancelled'; reason: string; classifier?: ClassifierResult }
  | { kind: 'suggested'; message: string; classifier: ClassifierResult }
  | { kind: 'ran'; message: DynamicWorkflowAssistantMessage; runId: string; classifier: ClassifierResult };

export type DynamicWorkflowAssistantMessage = {
  type: 'assistant';
  uuid: string;
  session_id: string;
  parent_tool_use_id: null;
  message: {
    role: 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  };
  isMeta: true;
  isSynthetic: true;
};

/**
 * The single integration point the QueryEngine calls. Returns `null`
 * when ultracode is off or any required hook is missing, so callers
 * can safely call this unconditionally.
 *
 * The function is wrapped in `try/catch` internally — it must NEVER
 * throw, because a failure here would block the entire main loop.
 */
export async function tryAutoRunDynamicWorkflow(params: {
  prompt: string;
  workspaceRoot: string;
  sessionId: string;
  /** Whether the user explicitly invoked `/ultracode run`. */
  explicitlyRequested: boolean;
  /**
   * Optional cost ceiling from settings. If the planned workflow's
   * `estimatedTokenCost` exceeds this, skip auto-trigger.
   */
  costCeiling?: 'low' | 'medium' | 'high' | 'very-high';
  /**
   * Optional transcript context (prior turns, tool call count, last-
   * turn errored). Used by the complexity classifier to decide
   * whether to suggest ultracode even when the user hasn't enabled it.
   */
  transcriptContext?: TranscriptContext;
}): Promise<AutoWorkflowOutcome> {
  try {
    return await tryAutoRunInner(params);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { kind: 'not-triggered', reason: `auto-workflow error: ${reason}` };
  }
}

async function tryAutoRunInner(params: {
  prompt: string;
  workspaceRoot: string;
  sessionId: string;
  explicitlyRequested: boolean;
  costCeiling?: 'low' | 'medium' | 'high' | 'very-high';
  transcriptContext?: TranscriptContext;
}): Promise<AutoWorkflowOutcome> {
  const hooks = readHooks();
  const classifier = classifyTranscript({
    prompt: params.prompt,
    context: params.transcriptContext,
  });

  if (!hooks.plannerLlm || !hooks.agentRunner) {
    return { kind: 'not-triggered', reason: 'no ultracode hooks wired up', classifier };
  }
  const state = readUltracodeState(hooks);

  // If the user hasn't enabled ultracode but the classifier thinks the
  // task is complex, surface a suggestion instead of running anything.
  // The host decides whether to print the hint, prompt for /ultracode
  // on, or auto-enable.
  if (!state.enabled && !params.explicitlyRequested) {
    if (classifier.shouldSuggestUltracode) {
      const msg = buildUltracodeSuggestion(classifier);
      if (msg) {
        return { kind: 'suggested', message: msg, classifier };
      }
    }
    return { kind: 'not-triggered', reason: 'ultracode off and classifier did not suggest enabling', classifier };
  }

  if (!shouldAutoTriggerWorkflow({ state, prompt: params.prompt, explicitlyRequested: params.explicitlyRequested })) {
    return { kind: 'not-triggered', reason: 'heuristic did not fire', classifier };
  }

  const plan = await planDynamicWorkflow(params.prompt, hooks.plannerLlm);

  if (params.costCeiling && exceedsCostCeiling(plan.estimatedTokenCost, params.costCeiling)) {
    return {
      kind: 'not-triggered',
      reason: `cost ${plan.estimatedTokenCost} exceeds ceiling ${params.costCeiling}`,
      classifier,
    };
  }

  // First-time confirmation: ask the host's confirm hook (or default to
  // an auto-yes if no hook is wired up and the user has already
  // accepted once in this session).
  if (shouldRequestConfirmation(state) && hooks.confirm) {
    const summary = formatPlanSummary(plan);
    const ok = await hooks.confirm({
      summary,
      workflow: {
        subtasks: plan.subtasks.map(s => ({ role: s.role, id: s.id })),
        estimatedTokenCost: plan.estimatedTokenCost,
        rationale: plan.rationale,
      },
    });
    if (!ok) {
      writeUltracodeState(hooks, { ...state, confirmedOnce: true });
      return { kind: 'cancelled', reason: 'user declined first-run confirmation', classifier };
    }
  }

  const out = await runDynamicWorkflowAsCoordinator({
    workspaceRoot: params.workspaceRoot,
    workflow: plan,
    llm: hooks.plannerLlm,
    agentRunner: hooks.agentRunner,
    fresh: false,
  });

  // If a session goal is active, remember this run was started in
  // service of it — the goal command reads the list to display
  // "N workflow runs linked to this goal". We do this best-effort
  // (the helper is a no-op when there's no active goal) and never
  // fail the auto-run if it throws.
  try {
    const { linkWorkflowToActiveGoal } = await import('../utils/sessionGoalState.js');
    linkWorkflowToActiveGoal(plan.id);
  } catch {
    // best-effort linkage; not worth blocking the workflow on
  }

  writeUltracodeState(hooks, {
    ...state,
    enabled: true,
    confirmedOnce: true,
    workflowsStarted: state.workflowsStarted + 1,
  });

  return {
    kind: 'ran',
    runId: plan.id,
    message: buildAssistantMessage(plan, out.results, params.sessionId),
    classifier,
  };
}

function exceedsCostCeiling(
  plan: 'low' | 'medium' | 'high' | 'very-high',
  ceiling: 'low' | 'medium' | 'high' | 'very-high',
): boolean {
  const order = { low: 0, medium: 1, high: 2, 'very-high': 3 } as const;
  return order[plan] > order[ceiling];
}

function formatPlanSummary(plan: {
  subtasks: { role: string; id: string }[];
  estimatedTokenCost: string;
  rationale: string;
}): string {
  const total = plan.subtasks.length;
  const verifiers = plan.subtasks.filter(s => s.role === 'verifier').length;
  return [
    `Dynamic workflow requested.`,
    `Plan: ${total} subtasks (${verifiers} verifier${verifiers === 1 ? '' : 's'})`,
    `Cost: ${plan.estimatedTokenCost}`,
    `Rationale: ${plan.rationale}`,
  ].join('\n');
}

function buildAssistantMessage(
  plan: {
    id: string;
    subtasks: { id: string; role: string; title: string }[];
    estimatedTokenCost: string;
    rationale: string;
  },
  results: {
    subtaskId: string;
    output: string;
    verification?: 'confirmed' | 'refuted' | 'inconclusive';
    verificationReason?: string;
  }[],
  sessionId: string,
): DynamicWorkflowAssistantMessage {
  const lines: string[] = [
    `◈ ultracode · dynamic workflow ${plan.id} completed (${plan.estimatedTokenCost}).`,
    `Rationale: ${plan.rationale}`,
    '',
    'Subtask results:',
  ];
  for (const r of results) {
    const sub = plan.subtasks.find(s => s.id === r.subtaskId);
    const tag = r.verification ? ` [${r.verification}]` : '';
    const label = sub ? `${sub.title} (${sub.role})` : r.subtaskId;
    lines.push(`  · ${label}${tag}: ${truncate(r.output, 280)}`);
  }
  const refuted = results.filter(r => r.verification === 'refuted');
  if (refuted.length > 0) {
    lines.push('');
    lines.push(`Adversarial verifiers refuted ${refuted.length} finding(s); treat those with skepticism.`);
  }
  return {
    type: 'assistant',
    uuid: randomUUID(),
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: lines.join('\n') }],
    },
    isMeta: true,
    isSynthetic: true,
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
