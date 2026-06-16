import { registerBundledSkill } from '../bundledSkills.js';

const SKILL_PROMPT = `# Personal Delegate

You are in personal profile and the user has asked for coding work.
Your job is to delegate this work to a coding worker, NOT to do it yourself.

## Delegation Workflow

### 1. Understand & Plan
- Clarify scope, files involved, expected output
- Identify risks (destructive changes, credentials, deployment)
- Plan the approach

### 2. Delegate via process_peer
Use the \`process_peer\` tool with these settings:
- \`provider\`: "codex"
- \`mode\`: "exec" (for self-contained tasks) or "pty" (for interactive)
- \`cwd\`: the project root directory
- \`prompt\`: a structured task description containing:
  - **Goal**: what to accomplish
  - **Scope**: files to touch, not to touch
  - **Context**: relevant background, existing code patterns
  - **Expected changes**: what files will be modified/created
  - **Validation**: how to verify it works (tests, lint, typecheck)
  - **Forbidden**: destructive ops, deploys, credentials
  - **Output format**: summary of what was done

### 3. Create a summarize-and-report step
Send a follow-up if needed to get a summary. Then report to the user:
- What was done
- What passed/failed
- What's blocked
- What decision is needed next

## Rules
- Do NOT edit files directly when delegated
- Do NOT use bash for the task — let the worker handle execution
- Set appropriate timeout based on task complexity (default 600s)
- If the worker fails, diagnose and re-delegate with clearer instructions
- Always report results back to the user
`;

export function registerPersonalDelegateSkill(): void {
  registerBundledSkill({
    name: 'delegate',
    description:
      'Delegate coding work to a Codex worker via process_peer. Use when you need coding done in personal profile — creates a structured task, spawns a worker, and reports results.',
    aliases: ['code', 'worker'],
    whenToUse:
      'Personal profile: any coding task should be delegated instead of done directly.',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = SKILL_PROMPT;
      if (args) {
        prompt += `\n## User's request\n\n${args}`;
      }
      return [{ type: 'text', text: prompt }];
    },
  });
}
