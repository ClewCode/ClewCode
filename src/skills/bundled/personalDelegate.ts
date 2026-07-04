import { registerBundledSkill } from '../bundledSkills.js';

const SKILL_PROMPT = `# Personal Delegate

You are in personal profile and the user has asked for coding work.
Your job is to delegate this work to a coding worker (LAN peer or local process), NOT to do it yourself.

## Peer Flow (always use this)

### 1. Understand & Plan
- Clarify scope, files involved, expected output
- Identify risks (destructive changes, credentials, deployment)
- Plan the approach

### 2. \`peer_spawn\`
Spawn peer node(s) for the task.

### 3. \`peer_discover\`
Confirm spawned peers are ready and get their info.

### 4. Send tasks
- **Single task → one peer**: \`peer_send_message\`
- **Same task → all peers**: \`peer_broadcast\`
- **Shell command → all peers**: \`peer_swarm\`
- **Multiple tasks → multiple peers**: \`peer_send_message\` to each

Each message must contain a self-contained task prompt:
  - **Goal**: what to accomplish
  - **Scope**: files to touch, not to touch
  - **Context**: relevant background, existing code patterns
  - **Expected changes**: what files will be modified/created
  - **Validation**: how to verify it works (tests, lint, typecheck)
  - **Forbidden**: destructive ops, deploys, credentials
  - **Output format**: summary of what was done

### 5. Summarize & report
Tell the user what was done, what passed/failed, what's blocked, next steps.

## Codex (ONLY when user explicitly says)
Never auto-select Codex. Only use the \`ExecAgent\` tool if the user says "ใช้ Codex" or "use Codex":
- \`provider\`: leave empty (auto-selects codex)
- \`mode\`: "exec" or "pty"
- \`cwd\`: project root
- \`prompt\`: structured task description

## Rules
- Do NOT edit files directly
- ALWAYS use peer flow above, never default to Codex
- Only use Codex when the user explicitly says so
`;

export function registerPersonalDelegateSkill(): void {
  registerBundledSkill({
    name: 'delegate',
    description:
      'Delegate coding work to LAN peer nodes or a local Codex worker. Use when you need coding done in personal profile — discovers peers for parallel work, falls back to local process, and reports results.',
    aliases: ['code', 'worker'],
    whenToUse: 'Personal profile: any coding task should be delegated instead of done directly.',
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
