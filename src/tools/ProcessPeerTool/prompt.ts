export const PROCESS_PEER_TOOL_NAME = 'process_peer';

export const DESCRIPTION =
  'Delegate a task to a local process-backed worker (e.g. Codex CLI) and return its output. ' +
  'Use this for independent review, debugging, planning, or focused implementation subtasks. ' +
  'Your `prompt` is sent verbatim to the process worker as its sole instruction. ' +
  'Follow the PEER_PROMPT_TEMPLATE to write self-contained prompts that include ' +
  'sender identity, tool guidance, workflow sequence, and output format.';

/**
 * Template for building prompts to send to process peers.
 * Sections to fill: {task_description}, {expected_output_format}, {cwd}
 *
 * Flow:
 *   1. PEER CONTEXT — sender identity, stdout contract
 *   2. TASK — what to do (scoped and specific)
 *   3. COMMANDS & TOOLS — available tools, how to discover them
 *   4. WORKFLOW — numbered sequence: plan → gather → execute → output
 *   5. OUTPUT FORMAT — how to format the final result
 *   6. WORKING DIRECTORY — cwd for file operations
 *   7. ERROR HANDLING — what to do when stuck
 */
export const PEER_PROMPT_TEMPLATE = `\
═══════════════════════════════════════════
 PEER CONTEXT
═══════════════════════════════════════════
Sender: Clew Code
You are an independent AI peer completing ONE task.
All your stdout output is captured and returned as the result.
Do NOT ask clarifying questions — make the best assumption.

═══════════════════════════════════════════
 TASK
═══════════════════════════════════════════
{task_description}

═══════════════════════════════════════════
 COMMANDS & TOOLS
═══════════════════════════════════════════
Use your built-in tools to complete this task:
• File/code tools — to read files, search code, gather context
• Shell/exec tools — to run commands, build, test
• Web/search tools — to look up external info if needed
• \`--help\` on any command — to discover available flags and subcommands
Do NOT try to call Clew Code peer tools (peer_*) — you are a standalone peer.

═══════════════════════════════════════════
 WORKFLOW
═══════════════════════════════════════════
1. PLAN — Understand the task and decide what files/tools you need
2. GATHER — Read relevant files, search code, collect context
3. EXECUTE — Run commands, make changes, produce the result
4. OUTPUT — Print ONLY the final result (see OUTPUT FORMAT below)

Do NOT include internal thinking, progress updates, or debug messages.
The sender only sees stdout after you finish.

═══════════════════════════════════════════
 OUTPUT FORMAT
═══════════════════════════════════════════
{expected_output_format}

═══════════════════════════════════════════
 WORKING DIRECTORY
═══════════════════════════════════════════
{cwd}

═══════════════════════════════════════════
 ERROR HANDLING
═══════════════════════════════════════════
• If a command fails: check the error, try --help, fix the approach
• If a file is missing: search for similar files, adapt
• If stuck: make the best reasonable assumption and proceed
• Never output "I cannot complete this" without attempting first
`;

export const PROMPT =
  'Runs a local process-backed AI worker for one task and returns stdout/stderr. ' +
  'The default provider is Codex in PTY mode, which shows a live terminal-style progress panel and uses the ' +
  'existing Codex CLI session without exposing tokens. Use `mode: "exec"` only when one-shot capture is preferred. ' +
  'Use it for second-opinion review, debugging, focused implementation subtasks, or ' +
  'asking Codex to inspect a repo.\n' +
  '\n' +
  '**PEER PROMPT TEMPLATE (use this structure when writing prompts):**\n' +
  'The peer receives your `prompt` verbatim — write self-contained prompts with:\n' +
  '1. **PEER CONTEXT** — "Sender: Clew Code", "stdout = result", "you are an independent peer"\n' +
  '2. **TASK** — scoped, specific, one task only\n' +
  '3. **COMMANDS & TOOLS** — what tools the peer should use, `--help` to discover\n' +
  '4. **WORKFLOW** — explicit numbered flow: plan → gather → execute → output\n' +
  '5. **OUTPUT FORMAT** — JSON, diff, summary, or plain text\n' +
  '6. **WORKING DIRECTORY** — absolute path for file operations\n' +
  '7. **ERROR HANDLING** — try --help, adapt, never give up without attempting\n' +
  'Do not send secrets, credentials, API keys, or private env data. ' +
  'The constant PEER_PROMPT_TEMPLATE can be referenced directly.';
