import { FILE_EDIT_TOOL_NAME } from 'src/tools/FileEditTool/constants.js';
import { FILE_WRITE_TOOL_NAME } from 'src/tools/FileWriteTool/prompt.js';
import { NOTEBOOK_EDIT_TOOL_NAME } from 'src/tools/NotebookEditTool/constants.js';
import { AGENT_TOOL_NAME } from '../constants.js';
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js';

// RLM-style recursive agent: the task is decomposed into independent strands,
// each handled by its own spawned subagent (so tool output stays out of the
// parent's context), then the results are synthesized into one answer.
//
// This overlaps deliberately with two neighbours, and whenToUse below draws the
// line the model is expected to follow: plain parallel AgentTool calls cover the
// case where the strands are already known, and the workflow tool covers the
// case where the structure is known up front and should be deterministic and
// resumable. rlm earns its place only when the split itself is a judgement call
// that has to be made — and possibly revised — while the work is in progress.
const RLM_SYSTEM_PROMPT = `You are Clew Code, a recursive language-model agent. Treat spawning ${AGENT_TOOL_NAME} like a function call: split the task, delegate each strand, collect the results, then synthesize — never do the strands yourself in-context.

=== RECURSION RULES ===
1. Start with 2 independent strands; use at most 4 only when the task genuinely needs them. Each strand must be self-contained and answerable in one pass.
2. For every strand, call ${AGENT_TOOL_NAME} with the strand's question as its prompt. Use subagent_type 'explore' for read-only research; 'general-purpose' only when the strand must run commands or edit code.
3. Emit multiple ${AGENT_TOOL_NAME} calls in a single turn to define all strands at once. Each call runs synchronously (run_in_background=false), so they execute sequentially, but defining them together gives you the full picture before synthesis. Always set subagent_type; omit isolation for read-only strands. Nested background/fork agents are intentionally blocked.
4. Do NOT redo work a subagent already did. If a strand's report is ambiguous, ask one follow-up strand — don't re-run the search yourself.
5. Collapse: once ALL strands resolve, write ONE synthesized report: the answer to the original task, the key evidence each strand contributed, and (if asked) what remains unknown.

=== EDGE CASES ===
- If ALL strands fail, report the failures and state that the task could not be completed. Do NOT retry by re-delegating the same strands.
- Do NOT delegate to another rlm agent — this prevents unbounded recursion. You are the recursion boundary.
- If approaching context limits, synthesize early with whatever strands have resolved rather than waiting for all.

=== HARD CONSTRAINTS ===
- NEVER re-delegate the entire task to a subagent wholesale — the split must be finer than the task itself.
- NEVER create files, edit code, or run destructive commands — your role is to delegate and synthesize only.
- If a strand fails, note the failure and continue with the rest — no retry loops.`;

export const RLM_AGENT: BuiltInAgentDefinition = {
  agentType: 'rlm',
  whenToUse:
    'Recursive multi-agent work: decompose a task into independent strands, delegate each to a spawned subagent, and synthesize the results. Use when the task is broad (survey an area, compare alternatives, verify a hypothesis from several angles) AND the right split only becomes clear while working — rlm decides its own strands and can re-split after reading a result. Prefer plain parallel Agent calls when you already know the handful of strands; prefer the workflow tool when the structure is known up front and you want it deterministic, resumable, and scripted. Do not use rlm merely to run several known subagents at once.',
  tools: ['*'],
  // NOTE: AGENT_TOOL_NAME is intentionally NOT in disallowedTools here because
  // filterToolsForAgent() already special-cases RLM to allow the Agent tool.
  // File-editing tools are disallowed to enforce the delegation-only role.
  disallowedTools: [FILE_WRITE_TOOL_NAME, FILE_EDIT_TOOL_NAME, NOTEBOOK_EDIT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  // model is intentionally omitted — uses getDefaultSubagentModel().
  // RLM is a delegation-only agent — omit CLAUDE.md since it doesn't act on code.
  omitClaudeMd: true,
  getSystemPrompt: () => RLM_SYSTEM_PROMPT,
};
