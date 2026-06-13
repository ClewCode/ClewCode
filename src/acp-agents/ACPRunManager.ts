/**
 * Agent Communication Protocol (ACP) — Run Manager.
 *
 * Manages the lifecycle of ACP runs on the Clew Code side.
 * A "run" represents a single agent execution with specific inputs,
 * supporting both synchronous and streaming output.
 *
 * When Clew Code acts as an ACP server, external agents can POST /runs
 * to execute tasks and GET /runs/{id} to check results.
 */

export type ACPRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ACPRun {
  id: string;
  agentName: string;
  input: unknown;
  status: ACPRunStatus;
  output: unknown;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
}

const runs = new Map<string, ACPRun>();

/**
 * Create a new run.
 */
export function createRun(id: string, agentName: string, input: unknown): ACPRun {
  const run: ACPRun = {
    id,
    agentName,
    input,
    status: 'running',
    output: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
  };
  runs.set(id, run);
  return run;
}

/**
 * Get a run by ID.
 */
export function getRun(id: string): ACPRun | undefined {
  return runs.get(id);
}

/**
 * List all runs.
 */
export function listRuns(): ACPRun[] {
  return Array.from(runs.values());
}

/**
 * Update run status to completed with output.
 */
export function completeRun(id: string, output: unknown): ACPRun | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  run.status = 'completed';
  run.output = output;
  run.completedAt = Date.now();
  return run;
}

/**
 * Update run status to failed with error.
 */
export function failRun(id: string, error: string): ACPRun | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  run.status = 'failed';
  run.error = error;
  run.completedAt = Date.now();
  return run;
}

/**
 * Cancel a run.
 */
export function cancelRun(id: string): ACPRun | undefined {
  const run = runs.get(id);
  if (!run) return undefined;
  run.status = 'cancelled';
  run.completedAt = Date.now();
  return run;
}

/**
 * Clear all runs (for testing).
 */
export function clearRuns(): void {
  runs.clear();
}
