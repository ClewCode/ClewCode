import { BASH_TOOL_NAME } from '../tools/BashTool/toolName.js';
import { FILE_EDIT_TOOL_NAME } from '../tools/FileEditTool/constants.js';
import { FILE_WRITE_TOOL_NAME } from '../tools/FileWriteTool/prompt.js';
import { POWERSHELL_TOOL_NAME } from '../tools/PowerShellTool/toolName.js';
import { isScratchpadPath } from './permissions/filesystem.js';

/** Minimal in-progress tool_use shape needed to describe active work. */
export type ActiveToolUse = {
  name: string;
  input?: Record<string, unknown>;
};

// Count added lines the same way FileWriteTool does: a trailing newline is a
// terminator, not a new empty line. Kept local so this pure helper avoids
// importing the React UI module.
function countLines(content: string): number {
  const parts = content.split('\n');
  return content.endsWith('\n') ? parts.length - 1 : parts.length;
}

function addedLinesForEdit(input: Record<string, unknown> | undefined): number {
  if (typeof input?.content === 'string') return countLines(input.content); // Write
  if (typeof input?.new_string === 'string') return countLines(input.new_string); // Edit
  return 0;
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Builds Claude Code's aggregated spinner verb from the tool calls currently
 * in flight — e.g. "Making 1 scratchpad edit +25, running 3 shell commands".
 * The trailing "…" is added by the Spinner. Returns null when nothing here
 * warrants a custom verb, so the caller falls back to the default verb.
 */
export function getActiveToolSpinnerVerb(activeTools: ActiveToolUse[]): string | null {
  let scratchpadEdits = 0;
  let scratchpadAddedLines = 0;
  let shellCommands = 0;

  for (const tool of activeTools) {
    const isWriteLike = tool.name === FILE_WRITE_TOOL_NAME || tool.name === FILE_EDIT_TOOL_NAME;
    const filePath = tool.input?.file_path;
    if (isWriteLike && typeof filePath === 'string' && isScratchpadPath(filePath)) {
      scratchpadEdits += 1;
      scratchpadAddedLines += addedLinesForEdit(tool.input);
    } else if (tool.name === BASH_TOOL_NAME || tool.name === POWERSHELL_TOOL_NAME) {
      shellCommands += 1;
    }
  }

  const parts: string[] = [];
  if (scratchpadEdits > 0) {
    parts.push(`Making ${pluralize(scratchpadEdits, 'scratchpad edit')} +${scratchpadAddedLines}`);
  }
  if (shellCommands > 0) {
    const verb = parts.length > 0 ? 'running' : 'Running';
    parts.push(`${verb} ${pluralize(shellCommands, 'shell command')}`);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}
