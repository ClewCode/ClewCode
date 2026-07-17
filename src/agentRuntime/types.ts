export type AgentPermissions = {
  read_files: 'allow' | 'guarded' | 'deny';
  write_files: 'allow' | 'guarded' | 'deny';
  shell: 'allow' | 'guarded' | 'deny';
  network: 'allow' | 'guarded' | 'deny';
  memory_write: 'allow' | 'pending_only' | 'deny';
};

export type AgentDefinition = {
  name: string;
  description: string;
  model: string;
  max_steps: number;
  tools: string[];
  permissions: AgentPermissions;
  handoff_to: string[];
  systemPrompt?: string;
};

type WorkflowAgentSpec = {
  next: string[];
};

export type RuntimeBudget = {
  maxSteps: number;
  maxToolCalls: number;
  maxLlmCalls: number;
  timeoutMs: number;
  maxOutputBytesPerTool: number;
  maxPatchBytes: number;
  maxChangedFiles: number;
  maxCostUsd: number | null;
};

export type WorkflowDefinition = {
  name: string;
  description: string;
  entry: string;
  agents: Record<string, WorkflowAgentSpec>;
  budgets: Partial<RuntimeBudget>;
  approval?: {
    required_for: string[];
  };
  verification?: {
    required: string[];
  };
};

export type AgentAction =
  | { type: 'message'; content: string }
  | { type: 'tool_call'; tool: string; input: unknown }
  | { type: 'handoff'; to: string; reason: string; summary: string; artifacts?: string[] }
  | { type: 'request_approval'; reason: string; proposedAction: unknown }
  | { type: 'complete'; summary: string; artifacts?: string[] }
  | { type: 'fail'; reason: string; recoverable: boolean };

export type RuntimeEvent = {
  id: string;
  runId: string;
  type:
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'run.paused'
    | 'run.cancelled'
    | 'agent.started'
    | 'agent.completed'
    | 'llm.requested'
    | 'llm.completed'
    | 'tool.requested'
    | 'tool.allowed'
    | 'tool.denied'
    | 'tool.completed'
    | 'tool.failed'
    | 'approval.requested'
    | 'approval.approved'
    | 'approval.denied'
    | 'handoff.created'
    | 'checkpoint.saved'
    | 'eval.started'
    | 'eval.completed';
  timestamp: string;
  agent?: string;
  tool?: string;
  spanId?: string;
  parentSpanId?: string;
  data?: Record<string, unknown>;
  redacted?: boolean;
};

export type AgentRun = {
  id: string;
  task: string;
  workflow: string;
  status:
    | 'created'
    | 'queued'
    | 'planning'
    | 'running'
    | 'waiting_approval'
    | 'paused'
    | 'testing'
    | 'reviewing'
    | 'completed'
    | 'failed'
    | 'cancelled';
  activeAgent: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  budget: RuntimeBudget;
};

export type ApprovalRequest = {
  id: string;
  runId: string;
  status: 'pending' | 'approved' | 'denied';
  risk: 'low' | 'medium' | 'high' | 'critical';
  tool: string;
  command?: string;
  reason: string;
  createdAt: string;
};

export type AgentState = {
  runId: string;
  status: AgentRun['status'];
  step: number;
  activeAgent: string;
  phase: string;
  taskSummary: string;
  knownFiles: string[];
  changedFiles: string[];
  openApprovals: ApprovalRequest[];
  lastCheckpoint?: string;
};

type RetrievedMemory = {
  id: string;
  content: string;
  score: number;
};

type ResearchFinding = {
  sourceId: string;
  url?: string;
  title?: string;
  snippet: string;
};

type ToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type BudgetRemaining = {
  steps: number;
  toolCalls: number;
  llmCalls: number;
  timeLeftMs: number;
};
