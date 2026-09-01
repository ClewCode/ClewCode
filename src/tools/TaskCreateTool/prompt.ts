import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';

export const DESCRIPTION =
  'ALWAYS create tasks BEFORE starting any multi-step coding work (2+ steps). Keep exactly ONE task in_progress at a time.';

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled() ? ' and potentially assigned to teammates' : '';

  const teammateTips = isAgentSwarmsEnabled()
    ? `- Include enough detail in the description for another agent to understand and complete the task
- New tasks are created with status 'pending' and no owner - use TaskUpdate with the \`owner\` parameter to assign them
`
    : '';

  return `Use this tool to create a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool

ALWAYS use this tool proactively — when in doubt, create tasks. Default to using tasks for any coding work.

Use this tool in these scenarios:

- ANY coding task with 2 or more steps - ALWAYS create tasks BEFORE coding, do NOT start without a task list
- Complex multi-step tasks - When a task requires 2 or more distinct steps or actions
- Non-trivial and complex tasks - Tasks that require careful planning or multiple operations${teammateContext}
- Plan mode - When using plan mode, create a task list to track the work
- User explicitly requests todo list - When the user directly asks you to use the todo list
- User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
- After receiving new instructions - Immediately capture user requirements as tasks
- When you start working on a task - Mark it as in_progress BEFORE beginning work
- After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Only skip using this tool when:
- There is exactly ONE trivial step (e.g. single-line comment, single file read)
- The task is purely conversational or informational with no code change

For everything else with 2+ steps, ALWAYS create tasks first.

## Task Fields

- **subject**: A brief, actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- **description**: What needs to be done
- **activeForm** (optional): Present continuous form shown in the spinner when the task is in_progress (e.g., "Fixing authentication bug"). If omitted, the spinner shows the subject instead.
- **metadata** (optional): Use \`{ "group": "Verification", "groupOrder": 2 }\` to place related tasks under an ordered TODO section. Reuse the exact same group name for every task in that section.

All tasks are created with status \`pending\`.

## Tips

- Create tasks with clear, specific subjects that describe the outcome
- For multi-phase work, group tasks into a few outcome-oriented sections such as Implementation, Verification, and Handoff
- After creating tasks, use TaskUpdate to set up dependencies (blocks/blockedBy) if needed
${teammateTips}- Check TaskList first to avoid creating duplicate tasks
`;
}
