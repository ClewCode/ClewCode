/**
 * Ultracode Mode
 *
 * Implements the "ultracode" setting from Anthropic's dynamic-workflows
 * announcement (May 2026): a session-level flag that:
 *   1. Sets effort level to `xhigh`.
 *   2. Lets Claude auto-decide when to spin up a dynamic workflow for the
 *      current task.
 *
 * Ultracode is opt-in. The first time a workflow would be triggered in a
 * session, the user is shown a confirmation + token-cost warning. After
 * the user accepts once, subsequent triggers in the same session proceed
 * without re-asking (matching the published behavior).
 *
 * This module is pure state + a small UI helper — it does not call any
 * LLM itself. The actual LLM plumbing lives in the host that calls
 * `planDynamicWorkflow`.
 */

import { EFFORT_XHIGH } from '../constants/figures.js';
import type { DynamicWorkflow } from './dynamicWorkflow.js';
import { shouldUseDynamicWorkflow } from './dynamicWorkflow.js';

export const ULTRACODE_GLYPH = EFFORT_XHIGH;

export type UltracodeState = {
  /** Whether the user has enabled ultracode in this session. */
  enabled: boolean;
  /** Whether the user has already accepted the first-time confirmation. */
  confirmedOnce: boolean;
  /** Total number of dynamic workflows already started in this session. */
  workflowsStarted: number;
};

export function createInitialUltracodeState(): UltracodeState {
  return { enabled: false, confirmedOnce: false, workflowsStarted: 0 };
}

export function enableUltracode(state: UltracodeState): UltracodeState {
  return { ...state, enabled: true };
}

export function disableUltracode(state: UltracodeState): UltracodeState {
  return { ...state, enabled: false };
}

export function markConfirmed(state: UltracodeState): UltracodeState {
  return { ...state, confirmedOnce: true };
}

export function recordWorkflowStart(state: UltracodeState): UltracodeState {
  return { ...state, workflowsStarted: state.workflowsStarted + 1 };
}

/**
 * Human-readable cost warning for the first-time confirmation. We mirror
 * the announcement's tone: "dynamic workflows can consume substantially
 * more tokens than a typical session, so we recommend starting on a
 * scoped task to get a feel for usage."
 */
export function formatConfirmationPrompt(workflow: Pick<DynamicWorkflow, 'subtasks' | 'estimatedTokenCost' | 'rationale'>): string {
  const verifierCount = workflow.subtasks.filter(s => s.role === 'verifier').length;
  const totalNodes = workflow.subtasks.length;
  const cost = workflow.estimatedTokenCost;
  return [
    `${ULTRACODE_GLYPH} Dynamic workflow requested.`,
    '',
    `Plan: ${totalNodes} subtasks across parallel waves (${verifierCount} adversarial verifier${verifierCount === 1 ? '' : 's'}).`,
    `Estimated cost: ${cost}.`,
    `Rationale: ${workflow.rationale}`,
    '',
    'Dynamic workflows can consume substantially more tokens than a typical',
    'session. We recommend starting on a scoped task to get a feel for usage.',
    '',
    'Continue? [Y/n]',
  ].join('\n');
}

/**
 * The auto-trigger decision used by the host. Returns true if a dynamic
 * workflow should be planned for this prompt. Three conditions:
 *   1. Ultracode must be enabled.
 *   2. The prompt must look hard enough to warrant a workflow.
 *   3. The caller hasn't already manually requested a workflow for this
 *      prompt (the host passes `explicitlyRequested`).
 */
export function shouldAutoTriggerWorkflow(params: {
  state: UltracodeState;
  prompt: string;
  explicitlyRequested: boolean;
}): boolean {
  if (params.explicitlyRequested) return true;
  if (!params.state.enabled) return false;
  return shouldUseDynamicWorkflow(params.prompt);
}

/**
 * Whether a confirmation should be shown before kicking off the workflow.
 * We confirm the first workflow in a session, then trust subsequent ones
 * (the announcement's behavior: "the first time a workflow triggers,
 * Clew Code shows what's about to run and asks you to confirm").
 */
export function shouldRequestConfirmation(state: UltracodeState): boolean {
  return state.workflowsStarted === 0 && !state.confirmedOnce;
}
