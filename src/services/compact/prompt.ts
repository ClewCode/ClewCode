import { feature } from 'bun:bundle';
import type { PartialCompactDirection } from '../../types/message.js';

// Dead code elimination: conditional import for proactive mode
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule = feature('KAIROS')
  ? // @ts-expect-error - Phase2: missing module stub (auto)
    (require('../../proactive/index.js') as typeof import('../../proactive/index.js'))
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */

// Aggressive no-tools preamble. The cache-sharing fork path inherits the
// parent's full tool set (required for cache-key match), and on Sonnet 4.6+
// adaptive-thinking models the model sometimes attempts a tool call despite
// the weaker trailer instruction. With maxTurns: 1, a denied tool call means
// no text output → falls through to the streaming fallback (2.79% on 4.6 vs
// 0.01% on 4.5). Putting this FIRST and making it explicit about rejection
// consequences prevents the wasted turn.
const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`;

// Two variants: BASE scopes to "the conversation", PARTIAL scopes to "the
// recent messages". The <analysis> block is a drafting scratchpad that
// formatCompactSummary() strips before the summary reaches context.
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`;

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Analyze the recent messages chronologically. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`;

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Goal: What the user wants to accomplish overall
2. Constraints & Preferences: Any constraints, preferences, or working style notes (e.g., "Typecheck fixes last", "Use bun", "Thai for interaction")
3. Progress: High-level status (Done / In Progress / Blocked)
4. Done: Bulleted list of completed items with checkboxes ✅, grouped by area
5. In Progress: Current active work
6. Blocked: Anything blocked with reason
7. Key Decisions: Important architectural/technical choices made
8. Next Steps: Concrete next actions
9. Critical Context: Files, error messages, providers, counts, git log references

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
Goal
- [Primary goal]

Constraints & Preferences
- [Constraint 1]
- [Constraint 2]

Progress
### Done
- [x] [Item 1 with file references]
- [x] [Item 2]

### In Progress
- [ ] [Current work]

### Blocked
- [Blocker with reason]

Key Decisions
- [Decision 1 with rationale]
- [Decision 2]

Next Steps
1. [Next step 1]
2. [Next step 2]

Critical Context
- Files: [key files]
- Error messages: [key errors]
- Providers/Configs: [relevant config]
- Counts: [metrics]
- Git log: [relevant commits]
</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response. 

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>

IMPORTANT: Pay special attention to any sensitive user instructions (such as custom rules, security preferences, or specific behavioral guidelines the user has explicitly stated). These must be preserved verbatim in your summary - do not paraphrase or omit them, even if they seem unusual or redundant.
`;

const PARTIAL_COMPACT_PROMPT = `Your task is to create a detailed summary of the RECENT portion of the conversation — the messages that follow earlier retained context. The earlier messages are being kept intact and do NOT need to be summarized. Focus your summary on what was discussed, learned, and accomplished in the recent messages only.

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

Your summary should include the following sections:

1. Goal: What the user wants to accomplish overall
2. Constraints & Preferences: Any constraints, preferences, or working style notes
3. Progress: High-level status (Done / In Progress / Blocked)
4. Done: Bulleted list of completed items with checkboxes ✅
5. In Progress: Current active work
6. Blocked: Anything blocked with reason
7. Key Decisions: Important architectural/technical choices made
8. Next Steps: Concrete next actions
9. Critical Context: Files, error messages, providers, counts, git log references

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
Goal
- [Primary goal]

Constraints & Preferences
- [Constraint 1]
- [Constraint 2]

Progress
### Done
- [x] [Item 1 with file references]
- [x] [Item 2]

### In Progress
- [ ] [Current work]

### Blocked
- [Blocker with reason]

Key Decisions
- [Decision 1 with rationale]
- [Decision 2]

Next Steps
1. [Next step 1]
2. [Next step 2]

Critical Context
- Files: [key files]
- Error messages: [key errors]
- Providers/Configs: [relevant config]
- Counts: [metrics]
- Git log: [relevant commits]
</summary>
</example>

Please provide your summary based on the RECENT messages only (after the retained earlier context), following this structure and ensuring precision and thoroughness in your response.
`;

// 'up_to': model sees only the summarized prefix (cache hit). Summary will
// precede kept recent messages, hence "Context for Continuing Work" section.
const PARTIAL_COMPACT_UP_TO_PROMPT = `Your task is to create a detailed summary of this conversation. This summary will be placed at the start of a continuing session; newer messages that build on this context will follow after your summary (you do not see them here). Summarize thoroughly so that someone reading only your summary and then the newer messages can fully understand what happened and continue the work.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents in detail
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List errors encountered and how they were fixed.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results.
7. Pending Tasks: Outline any pending tasks with IDs (#), status, and next step file paths. Preserve task tracking state exactly.
8. Work Completed: Describe what was accomplished by the end of this portion.
9. Context for Continuing Work: Summarize any context, decisions, or state that would be needed to understand and continue the work in subsequent messages.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Important Code Snippet]

4. Errors and fixes:
    - [Error description]:
      - [How you fixed it]

5. Problem Solving:
   [Description]

6. All user messages:
    - [Detailed non tool use user message]

7. Pending Tasks:
   - [Task 1]

8. Work Completed:
   [Description of what was accomplished]

9. Context for Continuing Work:
   [Key context, decisions, or state needed to continue the work]

</summary>
</example>

Please provide your summary following this structure, ensuring precision and thoroughness in your response.
`;

const MEMORIES_SECTION = `


After your </summary>, optionally include a <memories> block capturing durable facts that should be remembered across sessions. Only include facts that are likely to be useful later — skip transient logs and one-off debugging output.

Supported types:
- [decision]   — Architecture or design decisions (e.g. "use tabs for indentation")
- [architecture] — System structure, module layout, component relationships
- [bug]        — Bug root causes and fixes
- [task_progress] — What was accomplished, pending items
- [command]    — Important CLI commands or build steps
- [note]       — Miscellaneous useful context

Example:
<memories>
[decision] use async/await over raw promises for better readability
[architecture] migrated to ESM module system with NodeNext resolution
</memories>

Include <memories> only when there are genuinely durable facts. It's fine to omit it entirely if the session produced nothing worth saving.`;

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — ' +
  'an <analysis> block followed by a <summary> block. ' +
  'Tool calls will be rejected and you will fail the task.' +
  MEMORIES_SECTION;

export function getPartialCompactPrompt(
  customInstructions?: string,
  direction: PartialCompactDirection = 'from',
): string {
  const template = direction === 'up_to' ? PARTIAL_COMPACT_UP_TO_PROMPT : PARTIAL_COMPACT_PROMPT;
  let prompt = NO_TOOLS_PREAMBLE + template;

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }

  prompt += NO_TOOLS_TRAILER;

  return prompt;
}

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT;

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`;
  }

  prompt += NO_TOOLS_TRAILER;

  return prompt;
}

/**
 * Side channel: the most recent raw summary response from compact.
 * Used by autoExtractFromSession to parse <memories> without
 * threading raw text through the entire compact pipeline.
 */
let lastRawCompactResponse: string | null = null;

export function getLastRawCompactResponse(): string | null {
  return lastRawCompactResponse;
}

export function setLastRawCompactResponse(raw: string | null): void {
  lastRawCompactResponse = raw;
}

/**
 * Formats the compact summary by stripping the <analysis> drafting scratchpad
 * and replacing <summary> XML tags with readable section headers.
 * Also extracts any <memories> block for durable knowledge.
 * @param summary The raw summary string potentially containing <analysis>, <summary>, and <memories> XML tags
 * @returns The formatted summary with analysis stripped, summary tags replaced by headers, and <memories> removed
 */
export function formatCompactSummary(summary: string): string {
  // Store raw for memory extraction
  setLastRawCompactResponse(summary);

  let formattedSummary = summary;

  // Strip analysis section
  formattedSummary = formattedSummary.replace(/<analysis>[\s\S]*?<\/analysis>/, '');

  // Extract and format summary section — no prefix: model output already
  // starts with section headers (Goal, Progress, etc.)
  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    formattedSummary = summaryMatch[1]?.trim() ?? formattedSummary;
  }

  // Strip <memories> block
  formattedSummary = formattedSummary.replace(/<memories>[\s\S]*?<\/memories>/, '');

  // Clean up extra whitespace between sections
  formattedSummary = formattedSummary.replace(/\n\n+/g, '\n\n');

  return formattedSummary.trim();
}

/**
 * Parse <memories> block from raw compact response.
 * Returns tagged lines (e.g. "[decision] use tabs") or empty array.
 */
export function parseCompactMemories(rawResponse: string): string[] {
  const match = rawResponse.match(/<memories>([\s\S]*?)<\/memories>/);
  if (!match) return [];
  const content = match[1] || '';
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('['));
}

export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
  transcriptPath?: string,
  recentMessagesPreserved?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary);

  let baseSummary = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${formattedSummary}`;

  if (transcriptPath) {
    baseSummary += `\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`;
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\nRecent messages are preserved verbatim.`;
  }

  if (suppressFollowUpQuestions) {
    let continuation = `${baseSummary}
Continue the conversation from where it left off without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I'll continue" or similar. Pick up the last task as if the break never happened.`;

    if (feature('KAIROS') && proactiveModule?.isProactiveActive()) {
      continuation += `

You are running in autonomous/proactive mode. This is NOT a first wake-up — you were already working autonomously before compaction. Continue your work loop: pick up where you left off based on the summary above. Do not greet the user or ask what to work on.`;
    }

    return continuation;
  }

  return baseSummary;
}
