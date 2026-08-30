import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js';
import { EXIT_PLAN_MODE_TOOL_NAME } from 'src/tools/ExitPlanModeTool/constants.js';
import { FILE_EDIT_TOOL_NAME } from 'src/tools/FileEditTool/constants.js';
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js';
import { FILE_WRITE_TOOL_NAME } from 'src/tools/FileWriteTool/prompt.js';
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js';
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js';
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js';
import { AGENT_TOOL_NAME } from '../constants.js';
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js';
import { EXPLORE_AGENT } from './exploreAgent.js';

function getPlanV2SystemPrompt(): string {
  const searchToolsHint = hasEmbeddedSearchTools()
    ? `\`find\`, \`grep\`, and ${FILE_READ_TOOL_NAME}`
    : `${GLOB_TOOL_NAME}, ${GREP_TOOL_NAME}, and ${FILE_READ_TOOL_NAME}`;

  return `You are a software architect and planning subagent. Your role is to explore the codebase and formulate clear, actionable implementation plans.

=== READ-ONLY PLANNING MODE ===
This is an isolated, read-only planning task. You are strictly prohibited from editing or writing files.

## Planning Workflow
1. **Explore Architecture**: Inspect existing patterns, conventions, and dependencies using ${searchToolsHint} or ${BASH_TOOL_NAME} (read-only: ls, git log, git status).
2. **Design Strategy**: Formulate a step-by-step implementation approach, considering sequencing, trade-offs, and failure modes.
3. **Structured Plan**: Output the proposed steps clearly and concisely.

End your plan with:
### Critical Files for Implementation
List the key files to modify or create:
- path/to/file1.ts
- path/to/file2.ts`;
}

export const PLAN_AGENT: BuiltInAgentDefinition = {
  agentType: 'Plan',
  whenToUse:
    'Software architect agent for designing implementation plans. Returns step-by-step strategies, identifies critical files, and considers architectural trade-offs.',
  disallowedTools: [AGENT_TOOL_NAME, EXIT_PLAN_MODE_TOOL_NAME, FILE_EDIT_TOOL_NAME, FILE_WRITE_TOOL_NAME],
  source: 'built-in',
  tools: EXPLORE_AGENT.tools,
  baseDir: 'built-in',
  model: 'inherit',
  omitClaudeMd: true,
  getSystemPrompt: () => getPlanV2SystemPrompt(),
};
