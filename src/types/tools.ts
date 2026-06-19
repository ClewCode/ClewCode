/**
 * Tool progress types shared across CLI and bridge.
 */

export interface MCPProgress {
  type: 'mcp';
  serverName: string;
  toolName: string;
  progress?: number;
  total?: number;
}

export interface SdkWorkflowProgress {
  type: 'sdk_workflow';
  workflowId: string;
  step: string;
  progress?: number;
  total?: number;
}

export interface SkillToolProgress {
  type: 'skill';
  skillName: string;
  action: string;
  progress?: number;
  total?: number;
}

export interface WebSearchProgress {
  type: 'web_search';
  query: string;
  status: 'searching' | 'fetching' | 'complete';
  urlsFound?: number;
}

export interface ProcessPeerProgress {
  type: 'process_peer';
  provider: string;
  mode: 'exec' | 'pty';
  command: string;
  displayCommand: string;
  cwd: string;
  elapsedMs: number;
  outputTail?: string;
  status: 'starting' | 'running' | 'complete' | 'failed';
}
