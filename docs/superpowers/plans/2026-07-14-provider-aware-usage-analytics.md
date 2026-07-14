# Provider-Aware Usage Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-style session summary and rolling 24-hour local contribution analysis to `/usage` without regressing provider-specific quota bars.

**Architecture:** Add one focused JSONL analytics service that discovers local sessions, defensively aggregates current-session and 24-hour records, and exposes a UI-oriented result. Load that result independently from the existing Claude/Codex utilization source and render focused presentation components in the Usage tab.

**Tech Stack:** TypeScript ESM, React/Ink, Bun test, Biome, existing session JSONL and stats utilities.

## Global Constraints

- Use Bun for development, checks, and tests.
- ESM only; use `node:` prefixes and `.js` extensions for relative imports.
- Edit `src/` only, never `dist/`.
- Use 2-space indentation, single quotes, 120 columns, and LF endings.
- Preserve all current uncommitted Codex `/usage` behavior.
- Show only analytics supported by direct local evidence; omit empty attribution groups.
- Update `AGENT.md` and `CHANGELOG.md` under `[Unreleased]` with behavior changes.

---

## File structure

- Create `src/services/localUsageAnalytics.ts`: pure record classification/aggregation plus async session-file loading.
- Create `src/services/localUsageAnalytics.test.ts`: fixtures and unit tests for aggregation and failure tolerance.
- Modify `src/components/Settings/Usage.tsx`: independent loading and rendering of local analytics beside remote limits.
- Create or modify the nearest existing Usage component test discovered during implementation; do not invent a second test harness.
- Modify `AGENT.md` and `CHANGELOG.md`: document the local/remote split.

### Task 1: Define and test local analytics aggregation

**Files:**
- Create: `src/services/localUsageAnalytics.ts`
- Create: `src/services/localUsageAnalytics.test.ts`

**Interfaces:**
- Produces: `loadLocalUsageAnalytics(options?: { now?: Date; currentSessionId?: string }): Promise<LocalUsageAnalytics>`
- Produces: `aggregateLocalUsageRecords(records: readonly LocalUsageRecord[], options: { now: Date; currentSessionId?: string }): LocalUsageAnalytics`
- Produces: exported `LocalUsageAnalytics`, `LocalModelUsage`, and `LocalContributionGroup` types.

- [ ] **Step 1: Write failing aggregation tests**

Create table-driven Bun tests with temporary JSONL fixtures that assert:

```ts
expect(result.session).toEqual({
  costUSD: 17.43,
  apiDurationMs: 1_841_000,
  wallDurationMs: 4_525_000,
  linesAdded: 613,
  linesRemoved: 43,
});
expect(result.models['claude-opus-4-8']).toMatchObject({
  inputTokens: 823,
  outputTokens: 99_900,
  cacheReadInputTokens: 17_200_000,
  cacheCreationInputTokens: 632_200,
});
```

Also assert that a record exactly 24 hours old is included, an older record is excluded, malformed lines are ignored, and absent Skills/Plugins/MCP groups are omitted.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `bun test src/services/localUsageAnalytics.test.ts`
Expected: FAIL because `localUsageAnalytics.js` does not exist.

- [ ] **Step 3: Implement minimal typed aggregation**

Define the UI contract:

```ts
export type LocalModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
};

export type LocalContributionGroup = {
  title: 'Skills' | 'Plugins' | 'MCP servers';
  entries: Array<{ name: string; percentage: number }>;
};

export type LocalUsageAnalytics = {
  session: {
    costUSD: number;
    apiDurationMs: number;
    wallDurationMs: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  models: Record<string, LocalModelUsage>;
  highContextPercentage?: number;
  contributionGroups: LocalContributionGroup[];
};
```

Reuse `getProjectsDir()`/filesystem conventions from `src/utils/stats.ts`. Parse JSONL one line at a time, narrow unknown values with predicates, classify `Skill` tool uses, plugin-qualified skill names, and `mcp__<server>__<tool>` calls from direct tool-use records, and calculate percentages from attributable token totals. Skip unreadable files/lines but do not suppress unexpected programming errors outside the file boundary.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `bun test src/services/localUsageAnalytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the new service**

Run: `bun x tsc --noEmit`
Expected: exit 0.

### Task 2: Render session and contribution sections independently

**Files:**
- Modify: `src/components/Settings/Usage.tsx`
- Test: nearest existing Usage/Settings component test found by `Glob`/codegraph.

**Interfaces:**
- Consumes: `loadLocalUsageAnalytics(): Promise<LocalUsageAnalytics>`.
- Preserves: `fetchUtilization()` and `fetchCodexUtilization()` behavior and existing limit labels.

- [ ] **Step 1: Add failing rendering tests**

Cover four states with mocked services:

```tsx
// Anthropic: Session + Claude quota + local factors
expect(output).toContain('Session');
expect(output).toContain('Usage by model:');
expect(output).toContain('Current week (all models)');
expect(output).toContain("What's contributing to your limits usage?");

// ChatGPT: Session + Codex quota
expect(output).toContain('Current session (5h)');

// Unsupported provider: local analytics + no remote bars
expect(output).toContain("Usage limits aren't available");

// Local failure: remote bars remain visible
expect(output).toContain('Current week');
```

- [ ] **Step 2: Run the focused component test and confirm RED**

Run the discovered focused test with `bun test <test-path>`.
Expected: FAIL because the Session/local contribution sections are absent.

- [ ] **Step 3: Split local and remote loading state**

Replace the single all-or-nothing loading path with independent state:

```ts
const [localAnalytics, setLocalAnalytics] = useState<LocalUsageAnalytics | null>(null);
const [localAnalyticsError, setLocalAnalyticsError] = useState(false);
```

Start local loading in its own effect. Keep retry targeted at whichever remote request failed; local read failures should produce a dim local-only notice without replacing quota content.

- [ ] **Step 4: Add focused presentation components**

Add file-local `SessionSummary`, `ModelUsageRows`, and `LocalContributingFactors` components. Use existing `formatCost`, compact number formatting, `Box`, and `Text`. Render groups only when `entries.length > 0`; render the high-context explanation only when the percentage exists and is greater than zero.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `bun test <test-path> src/services/localUsageAnalytics.test.ts`
Expected: PASS.

### Task 3: Documentation and complete verification

**Files:**
- Modify: `AGENT.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update documentation**

Extend the existing usage/rate-limit architecture entry to state that local session analytics are provider-independent, derived from local JSONL for the current session/rolling 24 hours, and loaded independently from remote quota windows. Add an `[Unreleased]` changelog item describing the visible Session and contributing-factor sections and their machine-local approximation.

- [ ] **Step 2: Run formatting and static checks**

Run: `bun run check:ci && bun x tsc --noEmit`
Expected: both commands exit 0.

- [ ] **Step 3: Run focused and full tests**

Run: `bun test src/services/localUsageAnalytics.test.ts --bail && bun test --bail`
Expected: all tests pass.

- [ ] **Step 4: Run shadow guard and smoke test**

Run: `bash scripts/check-shadow-pairs.sh src`
Expected: no drifted `.ts`/`.js` shadow pair.

Start the built/dev CLI with the project-supported Bun command, open `/usage` under Anthropic and ChatGPT, and verify the local section remains visible while quota labels switch by provider.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git diff -- src/services/localUsageAnalytics.ts src/services/localUsageAnalytics.test.ts src/components/Settings/Usage.tsx AGENT.md CHANGELOG.md`
Expected: no whitespace errors; diff contains no `dist/`, secrets, or unrelated refactors.
