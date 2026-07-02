import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js';
import { registerBundledSkill } from '../bundledSkills.js';

const CODE_REVIEW_PROMPT = `# Workflow-backed Code Review: Correctness Bug Detection

Run a staged code review workflow for the current changes at the requested effort level.

## Effort Levels

- **low** - Quick scan for obvious correctness bugs. Review directly unless the diff is large.
- **medium** - Use multiple finder agents and verify every concrete finding.
- **high** - Use one finder per correctness angle, a cleanup finder, and an independent verifier for each distinct finding.

## Required Workflow

### Phase 1: Scope

Establish the review scope before judging code:

1. Run \`git diff --stat\` and \`git diff HEAD\` (or the equivalent if staged changes are present).
2. Include untracked files only when they are clearly part of the user's current work.
3. Identify changed runtime files and tests. In this repo, if a changed \`.ts\`/\`.tsx\` file has a committed \`.js\` sibling, treat the pair as one runtime surface because Bun may execute the \`.js\` shadow.
4. Summarize the files and risk areas briefly before launching finders.

### Phase 2: Find

Use the ${AGENT_TOOL_NAME} tool for parallel read-only finder agents unless effort is **low** and the diff is tiny.

For **medium**, launch these finders:
- angle-A: logic, state transitions, data flow, null/undefined safety.
- angle-B: API contracts, error handling, async/concurrency, resource lifecycle.
- cleanup: tests, migration leftovers, source/shadow drift, missed generated or config effects.

For **high**, launch these finders:
- angle-A: logic, state transitions, data flow, null/undefined safety.
- angle-B: API contracts, error handling, async/concurrency, resource lifecycle.
- angle-C: cross-file integration, provider/tool contracts, security and permission boundaries.
- cleanup: tests, migration leftovers, source/shadow drift, dead code, formatting or release-note gaps.

Each finder must:
- Inspect only the scoped diff and directly related call sites.
- Return only high-confidence findings with file and line evidence.
- Avoid suggesting broad refactors or style-only changes.
- Include "No findings" if it cannot prove a correctness issue.

### Phase 3: Verify

For every distinct candidate finding from the finders, launch an independent verifier with ${AGENT_TOOL_NAME}.

Each verifier must:
- Re-read the cited code and relevant call path independently.
- Try to refute the finding first.
- Return one of: **confirmed**, **refuted**, or **needs-more-evidence**.
- Keep only confirmed findings in the final review. Drop refuted and weak findings.

### Phase 4: Sweep

After verification, do one direct cleanup sweep yourself:
- Deduplicate findings across agents.
- Check whether tests already cover the issue.
- Check whether the proposed fix would touch both \`.ts\`/\`.tsx\` and \`.js\` shadows where relevant.
- Confirm no finding relies on stale assumptions outside the diff.

### Phase 5: Synthesize

Report findings first, ordered by severity. Keep summaries secondary.

## Bug Categories to Check

1. **Logic errors**: Off-by-one, wrong operator, incorrect condition, missing early return
2. **Null/undefined safety**: Missing null checks, assuming values exist without validation
3. **Type safety**: Type mismatches, missing type guards, incorrect type assertions
4. **Error handling**: Swallowed errors, incomplete error propagation, missing try/catch
5. **State management**: Stale state, incorrect state transitions, missing immutability
6. **Concurrency**: Race conditions, deadlocks, shared mutable state without synchronization
7. **API contract violations**: Breaking expected input/output contracts, missing validation
8. **Security**: Injection vulnerabilities, missing authorization, exposed secrets
9. **Resource management**: Memory leaks, unclosed handles/file descriptors, connection leaks
10. **Edge cases**: Empty inputs, boundary values, unexpected formats, error paths

## Output Format

Use this format:

\`\`\`
## Bugs Found (effort: {effort})

### Bug 1: {short description}
- **Severity**: high/medium/low
- **File**: path/to/file.ts:line
- **Status**: confirmed by verifier
- **Issue**: what is wrong
- **Fix**: how to fix it

### Bug 2: {short description}
...

## Verification Notes
- Refuted: short list of dropped candidates, if useful.
- Not run: tests or commands you could not run.
\`\`\`

If no bugs were confirmed, report: \`No confirmed correctness bugs detected at {effort} effort level.\`

Do NOT fix the bugs - only report them. The user will decide how to proceed.
`;

const CODE_REVIEW_COMMENT_PROMPT = `## Inline GitHub PR Comments

Use the \`gh\` CLI to post confirmed findings as inline PR comments on the current pull request.

For each bug found, use:
\`\`\`
gh pr comment <pr-number> --body "**{description}**\\n\\n{details}" --edit-last
\`\`\`

Or for file-specific comments:
\`\`\`
gh api repos/:owner/:repo/pulls/:pr/comments \\
  --field body="{comment}" \\
  --field commit_id="{sha}" \\
  --field path="{file}" \\
  --field line="{line}"
\`\`\`
`;

export function buildCodeReviewPrompt(args: string | undefined): string {
  let effort = 'medium';
  let commentMode = false;
  let fixMode = false;

  if (args) {
    const effortMatch = args.match(/\b(low|medium|high)\b/i);
    if (effortMatch) {
      effort = effortMatch[1]!.toLowerCase();
    }

    if (args.includes('--fix')) {
      fixMode = true;
    }

    if (args.includes('--comment')) {
      commentMode = true;
    }
  }

  let prompt = CODE_REVIEW_PROMPT.replace('{effort}', effort);
  if (fixMode) {
    prompt = prompt.replace(
      'Do NOT fix the bugs - only report them. The user will decide how to proceed.',
      'Apply fixes directly to the working tree after verifier confirmation. Fix every confirmed bug, and update both source and .js shadow files where relevant.',
    );
  }
  if (commentMode) {
    prompt += `\n\n${CODE_REVIEW_COMMENT_PROMPT}`;
  }
  if (args) {
    prompt += `\n\n## User Request\n\n${args}`;
  }
  return prompt;
}

export function registerCodeReviewSkill(): void {
  registerBundledSkill({
    name: 'code-review',
    description:
      'Workflow-backed review of changed code for confirmed correctness bugs (low/medium/high). Pass --fix to apply changes directly. Pass --comment to post findings as inline GitHub PR comments.',
    userInvocable: true,
    kind: 'workflow',
    async getPromptForCommand(args) {
      return [{ type: 'text', text: buildCodeReviewPrompt(args) }];
    },
  });
}
