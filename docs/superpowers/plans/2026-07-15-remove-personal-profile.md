# Remove Personal Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete application-level personal profile, migrate legacy settings to coding, and render `WelcomeV2` during first-run onboarding.

**Architecture:** Application profile state is removed. Settings loading strips any legacy `profile` key before validation; all downstream types, prompts, logos, skills, and footer UI lose profile branches. Private memory scope remains untouched because it is a separate concept.

**Tech Stack:** TypeScript ESM, React/Ink, Zod settings schemas, Bun tests, Biome.

## Global Constraints

- Do not alter `MemoryScope = 'personal' | 'team'`.
- Relative imports retain `.js` extensions.
- Use Bun for tests and validation.
- Keep `CHANGELOG.md` updated under `[Unreleased]`.
- Do not modify `dist/`.

---

### Task 1: Legacy settings migration and coding-only type

**Files:**
- Modify: `src/types/profile.ts`
- Modify: `src/utils/settings/types.ts:53-60`
- Modify: `src/utils/settings/settings.ts:180-200`
- Test: `src/utils/settings/profileMigration.test.ts`

**Interfaces:**
- Produces: no `ClewProfile` type
- Produces: `normalizeLegacyProfile(settings: unknown): unknown` removing any legacy `profile` key
- Consumes: `SettingsSchema()` and existing file-settings parsing

- [ ] **Step 1: Write the failing migration test**

```ts
import { expect, test } from 'bun:test';
import { normalizeLegacyProfile } from './settings.js';

test('removes the legacy personal profile setting', () => {
  expect(normalizeLegacyProfile({ profile: 'personal', theme: 'dark' })).toEqual({
    theme: 'dark',
  });
});

test('does not rewrite unrelated settings', () => {
  const settings = { profile: 'coding', theme: 'dark' };
  expect(normalizeLegacyProfile(settings)).toEqual(settings);
});
```

- [ ] **Step 2: Run the test and verify the export is missing**

Run: `bun test src/utils/settings/profileMigration.test.ts`
Expected: FAIL because `normalizeLegacyProfile` is not exported.

- [ ] **Step 3: Implement the migration at the settings boundary**

Add to `src/utils/settings/settings.ts` and call it immediately after `safeParseJSON` for user/project/local settings before `SettingsSchema().safeParse(...)`:

```ts
export function normalizeLegacyProfile(settings: Record<string, unknown>): Record<string, unknown> {
  return settings.profile === 'personal' ? { ...settings, profile: 'coding' } : settings;
}
```

Delete `src/types/profile.ts` and remove profile state from `AppStateStore`.

Change `src/utils/settings/types.ts` by replacing the profile enum and deleting `personalPersonaName`:

```ts
// no application profile setting
```

- [ ] **Step 4: Run migration tests**

Run: `bun test src/utils/settings/profileMigration.test.ts`
Expected: 2 pass, 0 fail.

---

### Task 2: Remove personal profile prompt and runtime branches

**Files:**
- Modify: `src/constants/profilePrompts.ts`
- Modify: `src/state/AppStateStore.ts:75-76,489-492`
- Modify: `src/QueryEngine.ts:275`
- Test: `src/constants/profilePrompts.test.ts`

**Interfaces:**
- Produces: `CODING_SYSTEM_PROMPT` with no profile resolver

- [ ] **Step 1: Write the failing prompt test**

```ts
import { expect, test } from 'bun:test';
import { CODING_PROFILE_PROMPT, getProfilePrompt } from './profilePrompts.js';

test('uses the coding prompt for every session', () => {
  expect(getProfilePrompt()).toBe(CODING_PROFILE_PROMPT);
});
```

- [ ] **Step 2: Run the test before changing the signature**

Run: `bun test src/constants/profilePrompts.test.ts`
Expected: FAIL because the current function requires a profile argument.

- [ ] **Step 3: Delete the personal prompt and branch**

Remove `PERSONAL_PROFILE_PROMPT` and change the resolver:

```ts
export function getProfilePrompt(): string {
  return CODING_PROFILE_PROMPT;
}
```

Update `QueryEngine.ts`:

```ts
const profilePrompt = getProfilePrompt();
```

Keep `AppStateStore.profile` as `ClewProfile`, initialized to `'coding'`. Simplify `lastProfileModes` to coding-only state or remove it if its remaining callers no longer need per-profile storage.

- [ ] **Step 4: Run the prompt test**

Run: `bun test src/constants/profilePrompts.test.ts`
Expected: 1 pass, 0 fail.

---

### Task 3: Use WelcomeV2 in onboarding and simplify logos

**Files:**
- Modify: `src/components/Onboarding.tsx:10,248`
- Modify: `src/components/LogoV2/LogoV2.tsx`
- Modify: `src/components/LogoV2/CondensedLogo.tsx`
- Modify: `src/components/Messages.tsx:76-92,251,387,859`
- Test: `src/components/Onboarding.welcome.test.ts`

**Interfaces:**
- Produces: `LogoV2(): React.ReactNode` with no props
- Produces: `CondensedLogo(): React.ReactNode` with no props
- Consumes: existing `WelcomeV2()`

- [ ] **Step 1: Write a source-contract test for onboarding**

```ts
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('first-run onboarding renders WelcomeV2 instead of LogoV2', () => {
  const source = readFileSync(new URL('./Onboarding.tsx', import.meta.url), 'utf8');
  expect(source).toContain("import { WelcomeV2 } from './LogoV2/WelcomeV2.js'");
  expect(source).toContain('<WelcomeV2 />');
  expect(source).not.toContain('<LogoV2');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test src/components/Onboarding.welcome.test.ts`
Expected: FAIL because onboarding imports and renders `LogoV2`.

- [ ] **Step 3: Replace the onboarding header**

In `Onboarding.tsx`:

```ts
import { WelcomeV2 } from './LogoV2/WelcomeV2.js';
```

Replace `<LogoV2 isPersonal />` with `<WelcomeV2 />`.

- [ ] **Step 4: Remove logo profile props and branches**

Change public signatures:

```ts
export function LogoV2() {
```

```ts
export function CondensedLogo() {
```

Always render `Clew Code`, version, cwd, and standard condensed details. Remove `Clew Personal`, personal-specific freeze keys, and conditional omission of cwd/version.

In `Messages.tsx`, remove `profile` from `LogoHeader` and `Props`, defaulting, freeze keys, and call sites; render `<LogoV2 />` directly.

- [ ] **Step 5: Run the onboarding test**

Run: `bun test src/components/Onboarding.welcome.test.ts`
Expected: 1 pass, 0 fail.

---

### Task 4: Remove personal footer and profile indicators

**Files:**
- Modify: `src/components/PromptInput/PromptInputFooter.tsx:125-132,223`
- Modify: `src/components/PromptInput/PromptInputFooterLeftSide.tsx:135-153,288-388`

**Interfaces:**
- Consumes: standard coding session state
- Produces: footer behavior with no persona-name or `P` profile indicator

- [ ] **Step 1: Remove personal footer state**

Delete `currentProfile`, `isPersonalProfile`, and `personalPersonaName` from `PromptInputFooter.tsx`. Restore hint suppression to:

```ts
const suppressHint = suppressHintFromProps || isSearching;
```

Delete the right-side persona-name render.

- [ ] **Step 2: Remove left-side personal conditions**

Delete both `currentProfile` selectors, the early return for personal profile, `profileLabel`, and the conditional `P` indicator array entry. Preserve all non-profile statusline, task, teammate, and hint behavior.

- [ ] **Step 3: Run component tests**

Run: `bun test src/components/PromptInput src/components/LogoV2 src/components/Onboarding.welcome.test.ts`
Expected: all discovered tests pass, 0 fail.

---

### Task 5: Documentation, stale-reference audit, and full verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify if stale: `README.md`, `AGENT.md`, `CLAUDE.md`

**Interfaces:** None.

- [ ] **Step 1: Update changelog**

Under `[Unreleased]` add:

```md
### Removed
- **Personal application profile**: Removed the obsolete `profile: "personal"` prompt, settings, persona footer, and profile-aware logo variants. Legacy persisted profile settings have the obsolete field removed. First-run onboarding now renders `WelcomeV2`; the regular REPL continues to use the standard `LogoV2`.
```

- [ ] **Step 2: Audit stale references after graph orientation**

Run:

```bash
graphify query "personal application profile isPersonal personalPersonaName PERSONAL_PROFILE_PROMPT Clew Personal"
```

Then search `src/`, `README.md`, `AGENT.md`, and `CLAUDE.md` for application-profile references. Keep `MemoryScope` personal references unchanged.

Expected: no application-profile references remain.

- [ ] **Step 3: Run the static gate**

Run:

```bash
bun run check:ci && bash scripts/check-shadow-pairs.sh src
```

Expected: both commands exit 0.

- [ ] **Step 4: Compare TypeScript against baseline**

Run:

```bash
bun x tsc --noEmit
```

Expected: no new errors attributable to this change; record the existing baseline count separately.

- [ ] **Step 5: Run all tests**

Run:

```bash
bun test --bail
```

Expected: 0 failures.

- [ ] **Step 6: Exercise onboarding in the real CLI**

Run the project using the repo's onboarding path with a temporary config directory and confirm visually that `WelcomeV2` appears above step 1 while no `Clew Personal` or personal-profile indicator appears.

Expected: first-run wizard uses `WelcomeV2`; normal REPL startup still uses standard `LogoV2`.
