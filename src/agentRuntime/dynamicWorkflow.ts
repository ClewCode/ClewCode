/**
 * Dynamic Workflow Planner
 *
 * Implements the "dynamic workflows" pattern from Anthropic's Claude Code
 * announcement (May 2026): given a complex user prompt, decompose it into
 * a DAG of independent subtasks that can be executed in parallel by
 * subagents, with built-in adversarial verification.
 *
 * Unlike the static `WorkflowRegistry` (which loads pre-defined YAML
 * workflows), the planner generates a fresh workflow at runtime by asking
 * the model to break the prompt into independently-solvable subtasks.
 *
 * The planner is intentionally decoupled from the provider layer: callers
 * pass a `plannerLlm` function that takes a system prompt + user prompt
 * and returns a string. This keeps the planner testable and lets it ride
 * on top of whatever query/SDK the host is using.
 */

export type DynamicSubtaskRole =
  | 'researcher'
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'verifier'
  | 'fixer';

export type DynamicSubtask = {
  id: string;
  role: DynamicSubtaskRole;
  title: string;
  prompt: string;
  /** Other subtask ids whose results must be visible before this one starts. */
  dependsOn: string[];
  /** Optional id of a subtask that must adversarially verify this node's output. */
  verifiedBy?: string;
  /** Estimated effort (1-5); the scheduler uses this to balance parallel buckets. */
  effort: number;
};

export type DynamicWorkflow = {
  id: string;
  originalPrompt: string;
  createdAt: string;
  /** Why the planner chose to spin up a dynamic workflow instead of a single agent. */
  rationale: string;
  /** Topological order of subtasks; safe-to-run groups are contiguous. */
  subtasks: DynamicSubtask[];
  /** Max number of subtasks to run concurrently at any moment. */
  maxParallel: number;
  /** Token-budget warning shown to the user before the run starts. */
  estimatedTokenCost: 'low' | 'medium' | 'high' | 'very-high';
};

/**
 * A pluggable LLM caller. Host code wires this up to the active provider
 * (Anthropic, OpenAI, Gemini, OpenRouter, Copilot, etc.). For tests, pass
 * a fake that returns canned JSON.
 */
export type PlannerLlm = (params: { systemPrompt: string; userPrompt: string; maxTokens?: number }) => Promise<string>;

/**
 * Heuristic that decides whether a prompt is "hard enough" to warrant
 * a dynamic workflow rather than a single agent.
 *
 * The threshold follows the spirit of Anthropic's announcement: "work
 * you'd normally plan in quarters" — large migrations, codebase-wide
 * searches, anything spanning many files. We err on the side of false
 * positives: the user can always override via the /effort menu or
 * by simply not toggling `ultracode` on.
 */
export function shouldUseDynamicWorkflow(prompt: string): boolean {
  if (!prompt) {
    return false;
  }
  const lowered = prompt.toLowerCase();

  const triggerKeywords = [
    'audit',
    'migrate',
    'migration',
    'rewrite',
    'port',
    'refactor across',
    'find all',
    'find every',
    'hunt',
    'stress test',
    'stress-test',
    'harden',
    'security review',
    'security audit',
    'profiler',
    'profile',
    'end-to-end',
    'every file',
    'all files',
    'across all files',
    'every service',
    'codebase-wide',
    'repo-wide',
    'moderniz',
  ];
  if (triggerKeywords.some(kw => lowered.includes(kw))) {
    return true;
  }

  // Long, multi-step prompts with multiple actions
  if (prompt.length < 80) {
    return false;
  }
  const actionVerbs = (
    lowered.match(/\b(fix|implement|migrate|update|change|replace|add|remove|rewrite|port|find|scan|check|verify|test|refactor|document|review|audit)\b/g) || []
  ).length;
  if (actionVerbs >= 4 && prompt.length > 250) {
    return true;
  }

  return false;
}

const PLANNER_SYSTEM_PROMPT = `You are the Dynamic Workflow Planner for Clew (a Claude Code-compatible CLI).

Your job: given a complex user task, decompose it into a directed acyclic graph (DAG) of independent subtasks that can be executed by parallel subagents.

Each subtask must be:
- Self-contained (one subtask = one clearly bounded unit of work)
- Independently solvable (no shared mutable state across subtasks)
- Focused on a single role (researcher, coder, tester, reviewer, verifier, fixer)
- Sized so it can be completed by ONE subagent in a single session

Roles:
- "researcher": read-only exploration of the codebase
- "coder": write code changes for a specific module/file
- "tester": run tests and report results
- "reviewer": inspect a diff for quality/security
- "verifier": adversarially try to break / refute a finding from another subtask
- "fixer": apply a small fix to address a verifier's refutation

Dependencies:
- Use "dependsOn" to express that this subtask needs the output of another.
- Leaf nodes (with no dependents) should typically be reviewers or verifiers.
- Add a "verifier" node for every "coder"/"researcher" node that produces a
  factual claim or code change. Set the coder's "verifiedBy" to the verifier's id.

Output format: respond with ONLY valid JSON matching this TypeScript type:

{
  "rationale": "string explaining why this needs a workflow",
  "maxParallel": number (2..10, default 4),
  "subtasks": [
    {
      "id": "snake_case_short_name",
      "role": "researcher" | "coder" | "tester" | "reviewer" | "verifier" | "fixer",
      "title": "Short human-readable title",
      "prompt": "Self-contained instruction a subagent can execute without further context",
      "dependsOn": ["other_subtask_id"],
      "verifiedBy": "verifier_subtask_id_or_omit",
      "effort": number (1-5, rough relative size)
    }
  ]
}

Hard rules:
- NEVER produce a cycle. If A depends on B, B must not depend on A.
- Subtask count should match the work: do not over-fragment a small task,
  do not under-fragment a large one. Typical range: 3..30 subtasks.
- For a bug hunt across N files, prefer N independent "researcher" subtasks
  in parallel, each covering a file slice, then a "verifier" for each.
- For a migration touching N files, prefer N independent "coder" subtasks,
  each owning a file, then one "tester" that depends on all of them, then
  per-coder "verifier" subtasks.
- Set "effort" to your honest estimate of relative work (1 = trivial, 5 = large).

Respond with JSON only. No prose, no markdown fences.`;

/**
 * Ask the model to decompose a prompt into a DynamicWorkflow.
 *
 * The host wires `plannerLlm` to whatever provider/sdk is active so the
 * planner works uniformly across Anthropic, OpenAI, Gemini, OpenRouter,
 * GitHub Copilot, Ollama, etc.
 */
export async function planDynamicWorkflow(
  prompt: string,
  plannerLlm: PlannerLlm,
  options: { workspaceRoot?: string; maxTokens?: number } = {},
): Promise<DynamicWorkflow> {
  const text = await plannerLlm({
    systemPrompt: PLANNER_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: options.maxTokens ?? 4096,
  });
  const parsed = parsePlannerJson(text);
  const now = new Date().toISOString();

  const subtasks: DynamicSubtask[] = parsed.subtasks.map((s, i) => ({
    id: sanitizeId(s.id) || `task_${i + 1}`,
    role: s.role,
    title: s.title,
    prompt: s.prompt,
    dependsOn: (s.dependsOn || []).map(sanitizeId).filter(Boolean),
    verifiedBy: s.verifiedBy ? sanitizeId(s.verifiedBy) : undefined,
    effort: clamp(Math.round(s.effort ?? 3), 1, 5),
  }));

  validateDag(subtasks);

  return {
    id: generateId(now),
    originalPrompt: prompt,
    createdAt: now,
    rationale: parsed.rationale || 'Decomposed into parallel subtasks for concurrent execution.',
    subtasks,
    maxParallel: clamp(parsed.maxParallel ?? 4, 2, 10),
    estimatedTokenCost: estimateTokenCost(subtasks),
  };
}

function parsePlannerJson(text: string): {
  rationale: string;
  maxParallel?: number;
  subtasks: Array<{
    id: string;
    role: DynamicSubtaskRole;
    title: string;
    prompt: string;
    dependsOn?: string[];
    verifiedBy?: string;
    effort?: number;
  }>;
} {
  // Strip accidental ```json fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Try to recover JSON embedded in prose
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Dynamic workflow planner returned non-JSON output');
    }
    obj = JSON.parse(match[0]);
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('Dynamic workflow planner returned an invalid plan');
  }
  const plan = obj as { rationale?: string; maxParallel?: number; subtasks?: unknown };
  if (!Array.isArray(plan.subtasks) || plan.subtasks.length === 0) {
    throw new Error('Dynamic workflow planner returned an empty plan');
  }
  return plan as ReturnType<typeof parsePlannerJson>;
}

function sanitizeId(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function generateId(timestamp: string): string {
  const date = timestamp.replace(/[^0-9]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `dynwf-${date}-${rand}`;
}

function estimateTokenCost(subtasks: DynamicSubtask[]): DynamicWorkflow['estimatedTokenCost'] {
  const totalEffort = subtasks.reduce((sum, s) => sum + s.effort, 0);
  const verifiers = subtasks.filter(s => s.role === 'verifier').length;
  if (totalEffort >= 40 || verifiers >= 6) return 'very-high';
  if (totalEffort >= 20 || verifiers >= 3) return 'high';
  if (totalEffort >= 8) return 'medium';
  return 'low';
}

function validateDag(subtasks: DynamicSubtask[]): void {
  const ids = new Set(subtasks.map(s => s.id));
  for (const s of subtasks) {
    for (const dep of s.dependsOn) {
      if (!ids.has(dep)) {
        throw new Error(`Subtask ${s.id} depends on unknown task ${dep}`);
      }
    }
    if (s.verifiedBy && !ids.has(s.verifiedBy)) {
      // Silently drop a dangling verifier reference rather than failing the
      // whole plan — the planner sometimes speculatively points at a node
      // it later removes.
      s.verifiedBy = undefined;
    }
  }
  // Cycle detection via topological sort
  const indegree = new Map<string, number>();
  const graph = new Map<string, string[]>();
  for (const s of subtasks) {
    indegree.set(s.id, s.dependsOn.length);
    graph.set(s.id, []);
  }
  for (const s of subtasks) {
    for (const dep of s.dependsOn) {
      const list = graph.get(dep);
      if (list) list.push(s.id);
    }
  }
  const queue: string[] = [];
  for (const [id, d] of indegree) {
    if (d === 0) queue.push(id);
  }
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of graph.get(id) || []) {
      const d = (indegree.get(next) || 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited !== subtasks.length) {
    throw new Error('Dynamic workflow planner returned a plan with a cycle');
  }
}

/**
 * Group subtasks into "waves" — sets of subtasks that can run in parallel
 * because all of their dependencies are satisfied. The orchestrator runs
 * each wave concurrently up to `maxParallel` at a time.
 */
export function computeExecutionWaves(workflow: DynamicWorkflow): DynamicSubtask[][] {
  const completed = new Set<string>();
  const waves: DynamicSubtask[][] = [];

  while (completed.size < workflow.subtasks.length) {
    const ready = workflow.subtasks.filter(
      s => !completed.has(s.id) && s.dependsOn.every(d => completed.has(d)),
    );
    if (ready.length === 0) {
      throw new Error('No progress possible — cycle or orphan in dynamic workflow');
    }
    // Sort: verifiers and reviewers last within a wave so they see the
    // artifacts produced by sibling coders/researchers in the same wave.
    ready.sort((a, b) => {
      const rank = (role: DynamicSubtaskRole) => (role === 'verifier' || role === 'reviewer' ? 1 : 0);
      return rank(a.role) - rank(b.role);
    });
    waves.push(ready);
    for (const s of ready) completed.add(s.id);
  }

  return waves;
}
