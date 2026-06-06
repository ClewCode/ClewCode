/**
 * Ultracode Dynamic Workflow Bootstrap
 *
 * Wires the globals (`__appState`, `__ultracodePlannerLlm`,
 * `__ultracodeAgentRunner`, `__ultracodeConfirm`) that the QueryEngine
 * reads to enable dynamic workflows.
 *
 * Call this once at startup from the host (main.tsx / CLI entrypoint)
 * after the app state store is created and the provider layer is ready.
 *
 * Uses `getAIProviderClient` directly (same pattern as goalEvaluator.ts)
 * instead of going through the query pipeline, avoiding the complex
 * `Options` type while still supporting every registered provider.
 * Lazily resolves the provider client on first call so the bootstrap
 * can run before auth/config is fully settled.
 */

const ULTRACODE_STATE_KEY = 'ultracodeState';

/**
 * Wire dynamic-workflow globals into `globalThis`.
 *
 * Safe to call early (before auth, before full config load) — the
 * LLM client is created lazily on first call. Call this at most once
 * per process lifetime; re-calling replaces the adapter without cleanup.
 *
 * @param store - The app state store (Store<AppState> or similar).
 *                Must expose `getState()` returning an object and
 *                `setState(updater)`.
 * @param initialState - Optional initial UltracodeState to use if no
 *                       state exists in the store yet.
 */
export function bootstrapUltracodeGlobals(
  store: {
    getState: () => Record<string, unknown>;
    setState: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
    subscribe?: (listener: () => void) => () => void;
  },
  initialState?: { enabled: boolean; confirmedOnce: boolean; workflowsStarted: number },
): void {
  const g = globalThis as {
    __appState?: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
    __ultracodePlannerLlm?: (params: {
      systemPrompt: string;
      userPrompt: string;
      maxTokens?: number;
    }) => Promise<string>;
    __ultracodeAgentRunner?: (
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
    __ultracodeConfirm?: (params: {
      summary: string;
      workflow: {
        subtasks: { role: string; id: string }[];
        estimatedTokenCost: string;
        rationale: string;
      };
    }) => Promise<boolean>;
  };

  // ── AppState adapter ────────────────────────────────────────────────
  let stateCache = store.getState();
  if (typeof store.subscribe === 'function') {
    store.subscribe(() => {
      stateCache = store.getState();
    });
  }

  g.__appState = {
    get: (key: string) => (stateCache as Record<string, unknown>)?.[key],
    set: (key: string, value: unknown) => {
      store.setState(prev => ({ ...prev, [key]: value }));
    },
  };

  // ── Initialize ultracode state in the store (if absent) ─────────────
  if (!g.__appState.get(ULTRACODE_STATE_KEY)) {
    const defaultState = initialState ?? { enabled: false, confirmedOnce: false, workflowsStarted: 0 };
    g.__appState.set(ULTRACODE_STATE_KEY, defaultState);
  }

  // ── Lazy provider client resolver ───────────────────────────────────
  let clientPromise: Promise<{
    client: import('../services/api/client.js').UnifiedAIProviderClient;
    model: string;
    smallModel: string;
  }> | null = null;

  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      const { getAIProviderClient } = await import('../services/api/client.js');
      const { getSmallFastModel, getMainLoopModel } = await import('../utils/model/model.js');
      const model = getMainLoopModel() || 'claude-sonnet-4-20250514';
      const smallModel = getSmallFastModel() || 'claude-haiku-4-20250514';
      const client = await getAIProviderClient({ maxRetries: 2, model });
      return { client, model, smallModel };
    })();
    return clientPromise;
  }

  // ── PlannerLlm ──────────────────────────────────────────────────────
  // Uses the small/fast model (Haiku-class) for speed. The planner is
  // text-in/text-out (no tools needed), so a cheap model is sufficient.

  g.__ultracodePlannerLlm = async ({ systemPrompt, userPrompt, maxTokens }) => {
    const { client, smallModel } = await getClient();
    const response = await client.beta.messages.create({
      model: smallModel,
      max_tokens: maxTokens ?? 4096,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = extractText(response);
    if (!text) throw new Error('PlannerLlm: empty response from model');
    return text;
  };

  // ── AgentRunner ─────────────────────────────────────────────────────
  // Uses the main loop model (user's chosen model) for best quality
  // via direct API call (all providers supported through the adapter).
  //
  // NOTE: Text-only LLM call — no tool access. For subtasks needing
  // bash, file I/O, grep (coder/researcher roles), upgrade to full
  // subagent spawn via spawnInProcessTeammate. That requires
  // ToolUseContext + MCP wiring from the coordinator, which is a
  // separate enhancement beyond this bootstrap module.

  g.__ultracodeAgentRunner = async (subtask, context) => {
    const { client, model } = await getClient();
    const prompt = context ? `${subtask.prompt}\n\n--- Prior context ---\n${context}` : subtask.prompt;

    const roleInstructions: Record<string, string> = {
      researcher: 'Cite file paths and line numbers. Be thorough but concise.',
      coder: 'Include file paths and full code content for every change.',
      tester: 'Describe the test setup, command, and results.',
      reviewer: 'Check correctness, security, edge cases, and conventions.',
      verifier: 'Be adversarial. Try to refute the finding before accepting it.',
      fixer: 'Apply minimal, targeted fixes. Explain the root cause.',
    };

    const instructions = roleInstructions[subtask.role] || 'Complete the task accurately.';

    const response = await client.beta.messages.create({
      model,
      max_tokens: 8192,
      temperature: 0.1,
      system: `You are a ${subtask.role} agent working on: ${subtask.title}\n${instructions}\nReturn your findings in the response.`,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = extractText(response);
    return { output: text ?? '' };
  };

  // ── Confirm hook ────────────────────────────────────────────────────
  // Shows the plan summary and asks the user to confirm (Y/n).
  // In non-TTY mode (pipelines, CI), auto-confirms after 1s.
  // After the user accepts once in a session, subsequent workflows in
  // the same session proceed without re-asking (handled by the caller).

  g.__ultracodeConfirm = async ({ summary: _summary, workflow }) => {
    // Build a compact summary with both the formatted summary (from caller)
    // and the structured plan (for the detail line).
    const total = workflow.subtasks.length;
    const verifiers = workflow.subtasks.filter(s => s.role === 'verifier').length;
    const lines = [
      `◈ ultracode · dynamic workflow requested`,
      `  Plan: ${total} subtask${total === 1 ? '' : 's'}` +
        (verifiers > 0 ? ` (${verifiers} adversarial verifier${verifiers === 1 ? '' : 's'})` : ''),
      `  Cost: ${workflow.estimatedTokenCost}`,
      `  ${workflow.rationale}`,
    ];

    const message = lines.join('\n');

    // In non-interactive mode: auto-confirm
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write(`${message}\n  → auto-confirmed (non-interactive)\n`);
      return true;
    }

    // Interactive: prompt on stderr (bypasses Ink rendering), read from stdin.
    // We temporarily take stdin from Ink's raw-mode handler.
    process.stderr.write(`\n${message}\nContinue? [Y/n] `);

    return new Promise<boolean>(resolve => {
      const cleanup = () => {
        process.stdin.removeListener('data', handler);
        try {
          process.stdin.setRawMode(true);
        } catch {
          /* best-effort */
        }
        process.stdin.ref();
      };

      const handler = (chunk: Buffer) => {
        const char = chunk.toString('utf8').trim().toLowerCase();
        if (char === 'n' || char === 'no') {
          cleanup();
          process.stderr.write('  cancelled.\n');
          resolve(false);
        } else if (char === '' || char === 'y' || char === 'yes') {
          cleanup();
          process.stderr.write('  continuing.\n');
          resolve(true);
        }
        // else: ignore, keep waiting for Y/n
      };

      try {
        process.stdin.setRawMode(false); // line-buffered for Y/n input
        process.stdin.on('data', handler);
        process.stdin.resume();
      } catch {
        // If stdin manipulation fails, auto-confirm
        cleanup();
        resolve(true);
      }

      // Safety timeout: auto-confirm after 30s
      setTimeout(() => {
        cleanup();
        process.stderr.write('  (timeout) continuing.\n');
        resolve(true);
      }, 30_000);
    });
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function extractText(response: unknown): string | null {
  const resp = response as {
    content?: Array<{ type: string; text?: string }>;
  };
  if (!resp.content || !Array.isArray(resp.content)) return null;
  const texts = resp.content
    .filter((b): b is { type: string; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text);
  return texts.length > 0 ? texts.join('\n') : null;
}
