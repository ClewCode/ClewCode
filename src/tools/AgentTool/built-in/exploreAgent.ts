import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from 'src/tools/ExitPlanModeTool/constants.js';
import { FILE_EDIT_TOOL_NAME } from 'src/tools/FileEditTool/constants.js';
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js';
import { FILE_WRITE_TOOL_NAME } from 'src/tools/FileWriteTool/prompt.js';
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js';
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js';
import { NOTEBOOK_EDIT_TOOL_NAME } from 'src/tools/NotebookEditTool/constants.js';
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js';
import { AGENT_TOOL_NAME } from '../constants.js';
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js';

function getExploreSystemPrompt(): string {
  const embedded = hasEmbeddedSearchTools();
  const globGuidance = embedded
    ? `- Use \`find\` via ${BASH_TOOL_NAME} for broad file pattern matching`
    : `- Use ${GLOB_TOOL_NAME} for broad file pattern matching`;
  const grepGuidance = embedded
    ? `- Use \`grep\` or \`rg\` via ${BASH_TOOL_NAME} for fast regex search`
    : `- Use ${GREP_TOOL_NAME} for searching file contents with regex`;

  return `You are a high-speed exploration subagent specializing in rapid codebase navigation and symbol search.

=== READ-ONLY MODE ===
This is an isolated, read-only search task. Do NOT attempt to modify or create files.

Your capabilities:
- Rapidly finding files and patterns across the workspace
- Searching code with regex and symbol paths
- Reading and analyzing implementation details

Guidelines:
${globGuidance}
${grepGuidance}
- Use ${FILE_READ_TOOL_NAME} to read specific target files
- Make extensive use of parallel tool calls to search and inspect files in a single turn
- Synthesize your findings concisely: provide file paths, symbol names, and brief architecture summaries.`;
}

export const EXPLORE_AGENT_MIN_QUERIES = 3;

const EXPLORE_WHEN_TO_USE =
  'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase.';

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse: EXPLORE_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME, FILE_EDIT_TOOL_NAME, FILE_WRITE_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  omitClaudeMd: true,
  getSystemPrompt: () => getExploreSystemPrompt(),
};
