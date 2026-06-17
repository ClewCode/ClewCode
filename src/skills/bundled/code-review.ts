import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js';
import { registerBundledSkill } from '../bundledSkills.js';

const CODE_REVIEW_PROMPT = `# Code Review: Correctness Bug Detection

Review the current changes for correctness bugs at the requested effort level.

## Effort Levels

- **low** — Quick scan for obvious bugs (type errors, null pointer risks, logic errors in the primary change path). Focus on the main changed areas.
- **medium** — Thorough review of all changed files. Check edge cases, error handling, race conditions, and state management.
- **high** — Exhaustive review including cross-cutting concerns, security implications, performance correctness, API contract violations, and concurrency bugs.

## Phase 1: Identify Changes

Run \`git diff\` (or \`git diff HEAD\` if there are staged changes) to see what changed. If there are no git changes, review the most recently modified files that the user mentioned or that you edited earlier in this conversation.

## Phase 2: Review for Correctness Bugs

Use the ${AGENT_TOOL_NAME} tool to launch review agents. For \`medium\` effort, launch 2 agents. For \`high\` effort, launch 3 agents. For \`low\` effort, review directly without agents.

### Bug Categories to Check

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

Report findings in this format:

\`\`\`
## Bugs Found (effort: {effort})

### Bug 1: {short description}
- **Severity**: high/medium/low
- **File**: path/to/file.ts:line
- **Issue**: what is wrong
- **Fix**: how to fix it

### Bug 2: {short description}
...
\`\`\`

If no bugs were found, report: \`No correctness bugs detected at {effort} effort level.\`

Do NOT fix the bugs — only report them. The user will decide how to proceed.
`;

const CODE_REVIEW_COMMENT_PROMPT = `## Inline GitHub PR Comments

Use the \`gh\` CLI to post findings as inline PR comments on the current pull request.

For each bug found, use:
\`\`\`
gh pr comment <pr-number> --body "**{description}**\\n\\n{details}" --edit-last
\`\`\`

Or for file-specific comments:
\`\`\`
gh api repos/:owner/:repo/pulls/:pr/comments \
  --field body="{comment}" \
  --field commit_id="{sha}" \
  --field path="{file}" \
  --field line="{line}"
\`\`\`
`;

export function registerCodeReviewSkill(): void {
  registerBundledSkill({
    name: 'code-review',
    description:
      'Review changed code for correctness bugs at a chosen effort level (low/medium/high). Pass --fix to apply changes directly. Pass --comment to post findings as inline GitHub PR comments.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let effort = 'medium';
      let commentMode = false;
      let fixMode = false;

      if (args) {
        // Parse effort level
        const effortMatch = args.match(/\b(low|medium|high)\b/i);
        if (effortMatch) {
          effort = effortMatch[1]!.toLowerCase();
        }

        // Check for --fix flag
        if (args.includes('--fix')) {
          fixMode = true;
        }

        // Check for --comment flag
        if (args.includes('--comment')) {
          commentMode = true;
        }
      }

      let prompt = CODE_REVIEW_PROMPT.replace('{effort}', effort);
      if (fixMode) {
        // Replace "Do NOT fix" instruction with "Apply fixes"
        prompt = prompt.replace(
          'Do NOT fix the bugs — only report them. The user will decide how to proceed.',
          'Apply the fixes directly to your working tree using the Edit tool. Fix each bug as you find it.',
        );
      }
      if (commentMode) {
        prompt += `\n\n${CODE_REVIEW_COMMENT_PROMPT}`;
      }
      if (args) {
        prompt += `\n\n## User Request\n\n${args}`;
      }
      return [{ type: 'text', text: prompt }];
    },
  });
}
