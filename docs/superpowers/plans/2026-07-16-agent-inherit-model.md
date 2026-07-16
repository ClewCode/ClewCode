# Agent Tool Model Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `model: "inherit"` to the Agent tool so a subagent uses the current session's exact provider/model, and prevent ChatGPT Responses requests from sending unsupported `temperature`.

**Architecture:** Keep provider routing unchanged. Extend the existing provider-aware agent model resolver with one explicit inheritance value, and remove one unsupported field at the ChatGPT adapter boundary.

**Tech Stack:** TypeScript, Zod, Bun test runner, Biome.

## Global Constraints

- Preserve existing behavior when Agent `model` is omitted or is `sonnet`, `opus`, or `haiku`.
- Explicit `inherit` must override agent frontmatter and the global `subagentModel` setting.
- Add no dependencies or provider field.
- Use Bun commands and update `CHANGELOG.md` under `[Unreleased]`.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Explicit Agent model inheritance

**Files:**
- Modify: `src/utils/model/agent.ts:13-14,89-154`
- Modify: `src/utils/model/agent.test.ts`
- Modify: `src/tools/AgentTool/AgentTool.tsx:137-147,219-225`
- Test: `src/tools/AgentTool/AgentTool.test.ts`

**Interfaces:**
- Consumes: `toolUseContext.options.mainLoopModel: string`.
- Produces: `AgentModelAlias = "sonnet" | "opus" | "haiku" | "best" | "sonnet[1m]" | "opus[1m]" | "opusplan" | "inherit"`; `getAgentModel(..., toolSpecifiedModel?: AgentModelAlias): string`.

- [ ] **Step 1: Add failing model-resolution tests**

Update the import and append the test below in `src/utils/model/agent.test.ts`:

```ts
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { getAgentModel, resolveSubagentDefaultModel } from './agent.js';

// inside describe(...)
test('explicit inherit uses the exact parent model over agent frontmatter', () => {
  expect(getAgentModel('sonnet', 'chatgpt/gpt-5.6-sol', 'inherit')).toBe('chatgpt/gpt-5.6-sol');
});
```

Use the existing settings mock pattern if the test environment supplies a `subagentModel`; the assertion must still prove that explicit `inherit` wins.

- [ ] **Step 2: Add a failing Agent schema test**

Create `src/tools/AgentTool/AgentTool.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { inputSchema } from './AgentTool.js';

test('accepts explicit parent-model inheritance', () => {
  expect(
    inputSchema().safeParse({
      description: 'Use parent model',
      prompt: 'Inspect the provider routing',
      model: 'inherit',
    }).success,
  ).toBe(true);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
bun test src/utils/model/agent.test.ts src/tools/AgentTool/AgentTool.test.ts
```

Expected: FAIL because `inherit` is not accepted by the Agent schema/type and explicit resolution does not yet bypass agent configuration.

- [ ] **Step 4: Implement the minimum resolver and schema change**

In `src/utils/model/agent.ts`, use the existing alias collection rather than creating another type:

```ts
export const AGENT_MODEL_OPTIONS = [...MODEL_ALIASES, 'inherit'] as const;
export type AgentModelAlias = (typeof AGENT_MODEL_OPTIONS)[number];

export function getAgentModel(
  agentModel: string | undefined,
  parentModel: string,
  toolSpecifiedModel?: AgentModelAlias,
  permissionMode?: PermissionMode,
): string {
  if (toolSpecifiedModel === 'inherit') return parentModel;

  const explicitSubagentModel = getUserSpecifiedSubagentModelSetting();
  // existing resolution remains unchanged
}
```

In `src/tools/AgentTool/AgentTool.tsx`, import `AGENT_MODEL_OPTIONS` and `AgentModelAlias`, change the field to:

```ts
model: z
  .enum(AGENT_MODEL_OPTIONS)
  .optional()
  .describe(
    'Optional model override for this agent. Use "inherit" for the current session model. Otherwise takes precedence over the agent definition model; if omitted, uses the agent definition model or inherits from the parent.',
  ),
```

Add `model?: AgentModelAlias` to `AgentToolInput` if inference does not retain the widened field.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
bun test src/utils/model/agent.test.ts src/tools/AgentTool/AgentTool.test.ts
```

Expected: both files pass with 0 failures.

---

### Task 2: ChatGPT Responses compatibility

**Files:**
- Modify: `src/services/ai/providers/ChatGPTProvider.ts:304-313`
- Create: `src/services/ai/providers/ChatGPTProvider.test.ts`

**Interfaces:**
- Consumes: `BetaMessageStreamParams` which may include `temperature`.
- Produces: ChatGPT `/responses` request bodies without a `temperature` property.

- [ ] **Step 1: Add a failing request-serialization test**

Create a fake `ResponsesClient`, obtain the registered ChatGPT adapter through the repository's existing adapter registry API, call `createMessage()` with a minimal `BetaMessageStreamParams` containing `temperature: 1`, and assert the captured request has no temperature:

```ts
expect(captured).not.toHaveProperty('temperature');
```

Use a valid minimal response (`{ id, model, output: [], usage: { input_tokens: 0, output_tokens: 0 } }`) so the test exercises the public adapter path instead of exposing the private serializer.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bun test src/services/ai/providers/ChatGPTProvider.test.ts
```

Expected: FAIL because `ChatGPTProvider.ts:310` currently copies `params.temperature` into the Responses request.

- [ ] **Step 3: Remove the unsupported field**

In `ChatGPTResponsesAdapter.convertToResponses()`, delete only this spread:

```ts
...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
```

Keep `top_p`, tools, stream, messages, and model behavior unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun test src/services/ai/providers/ChatGPTProvider.test.ts
```

Expected: PASS with 0 failures.

---

### Task 3: Documentation and verification

**Files:**
- Modify: `CHANGELOG.md:5-21`
- Modify: the relevant Agent tool documentation in `README.md` or `AGENT.md` only if it currently enumerates model values.

**Interfaces:**
- Consumes: completed behavior from Tasks 1-2.
- Produces: user-visible release note and verified source tree.

- [ ] **Step 1: Update the Unreleased changelog**

Add under the first `[Unreleased]` `### Added` or `### Fixed` section:

```md
- **Agent tool can inherit the active session model explicitly**: `model: "inherit"` now uses the current provider and exact parent model, bypassing agent model frontmatter and the global subagent model override. ChatGPT subagents also omit unsupported `temperature` from Responses API requests. (`src/tools/AgentTool/AgentTool.tsx`, `src/utils/model/agent.ts`, `src/services/ai/providers/ChatGPTProvider.ts`)
```

Do not rewrite unrelated existing changelog entries.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun test src/utils/model/agent.test.ts src/tools/AgentTool/AgentTool.test.ts src/services/ai/providers/ChatGPTProvider.test.ts
```

Expected: all tests pass with 0 failures.

- [ ] **Step 3: Run static verification**

Run:

```bash
bun run check:ci && bun x tsc --noEmit
```

Expected: exit code 0. If unrelated pre-existing errors remain, report their exact files and do not change unrelated user work.

- [ ] **Step 4: Inspect only the task diff**

Run:

```bash
git diff -- src/tools/AgentTool/AgentTool.tsx src/tools/AgentTool/AgentTool.test.ts src/utils/model/agent.ts src/utils/model/agent.test.ts src/services/ai/providers/ChatGPTProvider.ts src/services/ai/providers/ChatGPTProvider.test.ts CHANGELOG.md docs/superpowers/specs/2026-07-16-agent-inherit-model-design.md docs/superpowers/plans/2026-07-16-agent-inherit-model.md
```

Expected: only the approved model-inheritance, ChatGPT compatibility, tests, and documentation changes; no commit.
