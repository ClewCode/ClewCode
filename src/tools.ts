// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { toolMatchesName, type Tool, type Tools } from './Tool.js';
import { SkillTool } from './tools/SkillTool/SkillTool.js';
import { BashTool } from './tools/BashTool/BashTool.js';
import { FileEditTool } from './tools/FileEditTool/FileEditTool.js';
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js';
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool.js';
import { GlobTool } from './tools/GlobTool/GlobTool.js';
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool.js';
import { TaskStopTool } from './tools/TaskStopTool/TaskStopTool.js';
import { BriefTool } from './tools/BriefTool/BriefTool.js';

// Lazy loading for feature-gated or potentially absent tools
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const getCronTools = () => [
  require('./tools/ScheduleCronTool/CronCreateTool.js').CronCreateTool,
  require('./tools/ScheduleCronTool/CronDeleteTool.js').CronDeleteTool,
  require('./tools/ScheduleCronTool/CronListTool.js').CronListTool,
  require('./tools/ScheduleFollowupTool/ScheduleFollowupTool.js').ScheduleFollowupTool,
];
const getRemoteTriggerTool = () =>
  feature('AGENT_TRIGGERS_REMOTE') ? require('./tools/RemoteTriggerTool/RemoteTriggerTool.js').RemoteTriggerTool : null;
// Monitor tool always enabled (v2.1.98+)
const getMonitorTool = () => {
  try {
    return require('./tools/MonitorTool/MonitorTool.tsx').MonitorTool;
  } catch {
    return null;
  }
};
const getVerifyPlanExecutionTool = () =>
  process.env.CLEW_CODE_VERIFY_PLAN === 'true'
    ? require('./tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js').VerifyPlanExecutionTool
    : null;
const getWorkflowTool = () => {
  if (feature('WORKFLOW_SCRIPTS')) {
    require('./tools/WorkflowTool/bundled/index.js').initBundledWorkflows();
    return require('./tools/WorkflowTool/WorkflowTool.js').WorkflowTool;
  }
  return null;
};
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */

// Stable static imports
import { TaskOutputTool } from './tools/TaskOutputTool/TaskOutputTool.js';
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool.js';
import { WebFetchTool } from './tools/WebFetchTool/WebFetchTool.js';
import { JsonPathTool } from './tools/JsonPathTool/JsonPathTool.js';
import { TodoWriteTool } from './tools/TodoWriteTool/TodoWriteTool.js';
import { ExitPlanModeV2Tool } from './tools/ExitPlanModeTool/ExitPlanModeV2Tool.js';
import { ReadMediaFileTool } from './tools/ReadMediaFileTool/ReadMediaFileTool.js';
import { TestingPermissionTool } from './tools/testing/TestingPermissionTool.js';
import { GrepTool } from './tools/GrepTool/GrepTool.js';
import { TeamCreateTool } from './tools/TeamCreateTool/TeamCreateTool.js';
import { TeamDeleteTool } from './tools/TeamDeleteTool/TeamDeleteTool.js';
import { RequestShutdownTool } from './tools/RequestShutdownTool/RequestShutdownTool.js';
import { SubscribePrActivityTool, UnsubscribePrActivityTool } from './tools/PrSubscriptionTool/PrSubscriptionTool.js';
import { SendMessageTool } from './tools/SendMessageTool/SendMessageTool.js';
import { AskUserQuestionTool } from './tools/AskUserQuestionTool/AskUserQuestionTool.js';
import { PeerDiscoverTool } from './tools/PeerDiscoverTool/PeerDiscoverTool.js';
import { PeerSendMessageTool } from './tools/PeerSendMessageTool/PeerSendMessageTool.js';
import { PeerSpawnTool } from './tools/PeerSpawnTool/PeerSpawnTool.js';
import { PeerShareTool } from './tools/PeerShareTool/PeerShareTool.js';
import { PeerInfoTool } from './tools/PeerInfoTool/PeerInfoTool.js';
import { PeerRunTool } from './tools/PeerRunTool/PeerRunTool.js';
import { PeerJoinTool } from './tools/PeerJoinTool/PeerJoinTool.js';
import { PeerSetNameTool } from './tools/PeerSetNameTool/PeerSetNameTool.js';
import { PeerSetRoleTool } from './tools/PeerSetRoleTool/PeerSetRoleTool.js';
import { PeerListRolesTool } from './tools/PeerListRolesTool/PeerListRolesTool.js';
import { PeerPingTool } from './tools/PeerPingTool/PeerPingTool.js';
import { PeerDisconnectTool } from './tools/PeerDisconnectTool/PeerDisconnectTool.js';
import { PeerBroadcastTool } from './tools/PeerBroadcastTool/PeerBroadcastTool.js';
import { PeerSwarmTool } from './tools/PeerSwarmTool/PeerSwarmTool.js';
import { PeerDashboardTool } from './tools/PeerDashboardTool/PeerDashboardTool.js';
import { PeerListMessagesTool } from './tools/PeerListMessagesTool/PeerListMessagesTool.js';
import { PeerHelpTool } from './tools/PeerHelpTool/PeerHelpTool.js';
import { MemoryFeedbackTool } from './tools/MemoryFeedbackTool/MemoryFeedbackTool.js';
import { PeerMemorySyncTool } from './tools/PeerMemorySyncTool/PeerMemorySyncTool.js';
import { GoalTool } from './tools/GoalTool/GoalTool.js';
import { ResearchTool } from './tools/ResearchTool/ResearchTool.js';

import { AgentTool } from './tools/AgentTool/AgentTool.js';
import { LSPTool } from './tools/LSPTool/LSPTool.js';
import { ListMcpResourcesTool } from './tools/ListMcpResourcesTool/ListMcpResourcesTool.js';
import { ReadMcpResourceTool } from './tools/ReadMcpResourceTool/ReadMcpResourceTool.js';
import { ReadArtifactTool } from './tools/ReadArtifactTool/ReadArtifactTool.js';
import { ToolSearchTool } from './tools/ToolSearchTool/ToolSearchTool.js';
import { EnterPlanModeTool } from './tools/EnterPlanModeTool/EnterPlanModeTool.js';
import { EnterWorktreeTool } from './tools/EnterWorktreeTool/EnterWorktreeTool.js';
import { ExitWorktreeTool } from './tools/ExitWorktreeTool/ExitWorktreeTool.js';
import { TaskCreateTool } from './tools/TaskCreateTool/TaskCreateTool.js';
import { TaskGetTool } from './tools/TaskGetTool/TaskGetTool.js';
import { TaskUpdateTool } from './tools/TaskUpdateTool/TaskUpdateTool.js';
import { TaskListTool } from './tools/TaskListTool/TaskListTool.js';
import { SessionSearchTool } from './tools/SessionSearchTool/SessionSearchTool.js';
import { BrowserTool } from './tools/BrowserTool/BrowserTool.js';
import { ProjectRuleTool } from './tools/ProjectRuleTool/ProjectRuleTool.js';
import uniqBy from 'lodash-es/uniqBy.js';
import { isToolSearchEnabledOptimistic } from './utils/toolSearch.js';
import { isTodoV2Enabled } from './utils/tasks.js';
import { SYNTHETIC_OUTPUT_TOOL_NAME } from './tools/SyntheticOutputTool/SyntheticOutputTool.js';
import { isCoordinatorMode } from './coordinator/coordinatorMode.js';

export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
} from './constants/tools.js';
import { feature } from 'bun:bundle';

import type { ToolPermissionContext } from './Tool.js';
import { getDenyRuleForTool } from './utils/permissions/permissions.js';
import { hasEmbeddedSearchTools } from './utils/embeddedTools.js';
import { isEnvTruthy } from './utils/envUtils.js';
import { isPowerShellToolEnabled } from './utils/shell/shellToolUtils.js';
import { isAgentSwarmsEnabled } from './utils/agentSwarmsEnabled.js';
import { isWorktreeModeEnabled } from './utils/worktreeModeEnabled.js';
import { REPL_ONLY_TOOLS, REPL_TOOL_NAME, isReplModeEnabled } from './tools/REPLTool/constants.js';
export { REPL_ONLY_TOOLS };

/* eslint-disable @typescript-eslint/no-require-imports */
const getPowerShellTool = () => {
  if (!isPowerShellToolEnabled()) return null;
  return (
    require('./tools/PowerShellTool/PowerShellTool.js') as typeof import('./tools/PowerShellTool/PowerShellTool.js')
  ).PowerShellTool;
};
const getComputerUseTool = () => {
  if (!isEnvTruthy(process.env.ENABLE_COMPUTER_USE)) return null;
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') return null;
  return (
    require('./tools/ComputerUseTool/ComputerUseTool.js') as typeof import('./tools/ComputerUseTool/ComputerUseTool.js')
  ).ComputerUseTool;
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const TOOL_PRESETS = ['default'] as const;
export type ToolPreset = (typeof TOOL_PRESETS)[number];

export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase();
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null;
  }
  return presetString as ToolPreset;
}

export function getToolsForDefaultPreset(): string[] {
  const tools = getAllBaseTools();
  const isEnabled = tools.map(tool => tool.isEnabled());
  return tools.filter((_, i) => isEnabled[i]).map(tool => tool.name);
}

export function getAllBaseTools(): Tools {
  const cronTools = getCronTools();
  const remoteTriggerTool = getRemoteTriggerTool();
  const monitorTool = getMonitorTool();
  const verifyPlanExecutionTool = getVerifyPlanExecutionTool();
  const workflowTool = getWorkflowTool();

  return [
    TaskOutputTool,
    BashTool,
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    ExitPlanModeV2Tool,
    FileReadTool,
    ReadMediaFileTool,
    FileEditTool,
    FileWriteTool,
    NotebookEditTool,
    TodoWriteTool,
    WebSearchTool,
    WebFetchTool,
    BrowserTool,
    // BrowserAgentTool — disabled until ready
    // MultiSearchTool, // Using official WebSearch instead
    JsonPathTool,
    TaskStopTool,
    AskUserQuestionTool,
    SkillTool,
    EnterPlanModeTool,
    ResearchTool,
    // ConfigTool, TungstenTool — Anthropic-internal, removed in Clew Code
    ...(isTodoV2Enabled() ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool] : []),
    GoalTool,
    LSPTool,
    AgentTool,
    ...(isWorktreeModeEnabled() ? [EnterWorktreeTool, ExitWorktreeTool] : []),
    SendMessageTool,
    PeerDiscoverTool,
    PeerSendMessageTool,
    PeerSpawnTool,
    PeerShareTool,
    PeerInfoTool,
    PeerRunTool,
    PeerJoinTool,
    PeerSetNameTool,
    PeerSetRoleTool,
    PeerListRolesTool,
    PeerPingTool,
    PeerDisconnectTool,
    PeerBroadcastTool,
    PeerSwarmTool,
    PeerDashboardTool,
    MemoryFeedbackTool,
    PeerListMessagesTool,
    PeerHelpTool,
    PeerMemorySyncTool,

    ...(isAgentSwarmsEnabled() ? [TeamCreateTool, TeamDeleteTool, RequestShutdownTool] : []),
    ...(isAgentSwarmsEnabled() ? [SubscribePrActivityTool, UnsubscribePrActivityTool] : []),
    ...(verifyPlanExecutionTool ? [verifyPlanExecutionTool] : []),
    ...(workflowTool ? [workflowTool] : []),
    ...cronTools,
    ...(remoteTriggerTool ? [remoteTriggerTool] : []),
    ...(monitorTool ? [monitorTool] : []),
    BriefTool,
    ...(getPowerShellTool() ? [getPowerShellTool()] : []),
    ...(process.env.NODE_ENV === 'test' ? [TestingPermissionTool] : []),
    ListMcpResourcesTool,
    ReadMcpResourceTool,
    ReadArtifactTool,
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []),
    ...(getComputerUseTool() ? [getComputerUseTool()] : []),
    SessionSearchTool,
    ProjectRuleTool,
  ];
}

export function filterToolsByDenyRules<
  T extends {
    name: string;
    mcpInfo?: { serverName: string; toolName: string };
  },
>(tools: readonly T[], permissionContext: ToolPermissionContext): T[] {
  return tools.filter(tool => !getDenyRuleForTool(permissionContext, tool));
}

export const getTools = (permissionContext: ToolPermissionContext): Tools => {
  if (isEnvTruthy(process.env.CLEW_CODE_SIMPLE)) {
    const simpleTools: Tool[] = [BashTool, FileReadTool, FileEditTool];
    if (feature('COORDINATOR_MODE') && isCoordinatorMode()) {
      simpleTools.push(TaskStopTool, SendMessageTool);
    }
    return filterToolsByDenyRules(simpleTools, permissionContext);
  }

  const specialTools = new Set([ListMcpResourcesTool.name, ReadMcpResourceTool.name, SYNTHETIC_OUTPUT_TOOL_NAME]);

  const tools = getAllBaseTools().filter(tool => !specialTools.has(tool.name));

  let allowedTools = filterToolsByDenyRules(tools, permissionContext);

  if (isReplModeEnabled()) {
    const replEnabled = allowedTools.some(tool => toolMatchesName(tool, REPL_TOOL_NAME));
    if (replEnabled) {
      allowedTools = allowedTools.filter(tool => !REPL_ONLY_TOOLS.has(tool.name));
    }
  }

  const isEnabled = allowedTools.map(_ => _.isEnabled());
  return allowedTools.filter((_, i) => isEnabled[i]);
};

export function assembleToolPool(permissionContext: ToolPermissionContext, mcpTools: Tools): Tools {
  const builtInTools = getTools(permissionContext);
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext);
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name);
  return uniqBy([...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)), 'name');
}

export function getMergedTools(permissionContext: ToolPermissionContext, mcpTools: Tools): Tools {
  const builtInTools = getTools(permissionContext);
  return [...builtInTools, ...mcpTools];
}
