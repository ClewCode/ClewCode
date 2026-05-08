export const KANBAN_STATUSES = [
  'triage',
  'todo',
  'ready',
  'running',
  'blocked',
  'done',
  'archived',
] as const

export const KANBAN_COLUMNS = KANBAN_STATUSES

export const KANBAN_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const

export const KANBAN_RISKS = ['low', 'normal', 'high', 'critical'] as const

export const KANBAN_LEASE_STATUSES = [
  'claimed',
  'active',
  'stale',
  'zombie',
  'released',
] as const

export const KANBAN_RETRY_STRATEGIES = [
  'none',
  'fixed',
  'exponential',
] as const

export const KANBAN_EVENT_TYPES = [
  'created',
  'claimed',
  'heartbeat',
  'stale',
  'zombie',
  'reclaimed',
  'released',
  'started',
  'progress',
  'commented',
  'blocked',
  'unblocked',
  'failed',
  'retry_scheduled',
  'retried',
  'verification_added',
  'verification_passed',
  'verification_failed',
  'hallucination_detected',
  'completed',
  'archived',
] as const

export type KanbanStatus = (typeof KANBAN_STATUSES)[number]
export type KanbanPriority = (typeof KANBAN_PRIORITIES)[number]
export type KanbanRisk = (typeof KANBAN_RISKS)[number]
export type KanbanLeaseStatus = (typeof KANBAN_LEASE_STATUSES)[number]
export type KanbanRetryStrategy = (typeof KANBAN_RETRY_STRATEGIES)[number]
export type KanbanEventType = (typeof KANBAN_EVENT_TYPES)[number]

export const LEGACY_STATUS_MAP: Record<string, KanbanStatus> = {
  'Backlog': 'todo',
  'Ready': 'ready',
  'In Progress': 'running',
  'Review': 'running',
  'Blocked': 'blocked',
  'Done': 'done',
}

export const LEGACY_PRIORITY_MAP: Record<string, KanbanPriority> = {
  'Low': 'low',
  'Medium': 'normal',
  'High': 'high',
  'Critical': 'urgent',
}

export const LEGACY_RISK_MAP: Record<string, KanbanRisk> = {
  'Low': 'low',
  'Medium': 'normal',
  'High': 'high',
  'Critical': 'critical',
}

export const KANBAN_HEARTBEAT_INTERVAL_MS = 30000
export const KANBAN_LEASE_TTL_MS = 120000
export const KANBAN_ZOMBIE_GRACE_MS = 300000
export const KANBAN_DEFAULT_MAX_ATTEMPTS = 3

export type KanbanComment = {
  id: string
  author: string
  body: string
  createdAt: string
}

export type KanbanLease = {
  leaseId: string
  workerId: string
  claimedBy: string
  claimedAt: string
  expiresAt: string
  lastHeartbeatAt?: string
  heartbeatIntervalMs: number
  status: KanbanLeaseStatus
}

export type KanbanRetry = {
  attempt: number
  maxAttempts: number
  strategy: KanbanRetryStrategy
  nextRetryAt?: string
  lastError?: string
}

export type KanbanVerificationEvidence = {
  id: string
  type: 'command' | 'file' | 'diff' | 'test' | 'manual'
  label: string
  content?: string
  path?: string
  createdAt: string
}

export type KanbanVerification = {
  requiredCommands?: string[]
  lastRunCommands?: string[]
  passed?: boolean
  summary?: string
  evidence?: KanbanVerificationEvidence[]
}

export type KanbanHallucinationGuard = {
  expectedFiles?: string[]
  changedFiles?: string[]
  claimedCommands?: string[]
  verifiedCommands?: string[]
  claimedSummary?: string
  evidenceSummary?: string
  mismatchDetected?: boolean
  recoveryAction?: 'none' | 'ask_human' | 'retry' | 'reclaim' | 'rollback_note'
}

export type KanbanEvent = {
  id: string
  taskId: string
  type: KanbanEventType
  actor: string
  message: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export type KanbanTask = {
  id: string
  title: string
  body?: string
  status: KanbanStatus
  assignee?: string
  owner?: string
  priority?: KanbanPriority
  tags?: string[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  blockedReason?: string
  blockers?: string[]
  blockedFromStatus?: KanbanStatus
  comments?: KanbanComment[]
  metadata?: Record<string, unknown>
  files?: string[]
  validation?: string[]
  notes?: string
  scope?: string[]
  risk?: KanbanRisk
  assignedAgent?: string

  // Phase 3 fields
  lease?: KanbanLease
  retry?: KanbanRetry
  verification?: KanbanVerification
  hallucinationGuard?: KanbanHallucinationGuard
  events?: KanbanEvent[]
  workspaceId?: string
  projectId?: string
}

export type KanbanBoard = {
  version: 1
  tasks: KanbanTask[]
}

export type KanbanTaskInput = {
  title: string
  body?: string
  status?: KanbanStatus
  assignee?: string
  owner?: string
  priority?: KanbanPriority
  tags?: string[]
  files?: string[]
  validation?: string[]
  notes?: string
  scope?: string[]
  risk?: KanbanRisk
  assignedAgent?: string
  workspaceId?: string
  projectId?: string
}

export type KanbanTaskUpdate = Partial<
  Pick<
    KanbanTask,
    | 'title'
    | 'body'
    | 'status'
    | 'assignee'
    | 'owner'
    | 'priority'
    | 'tags'
    | 'completedAt'
    | 'blockedReason'
    | 'blockedFromStatus'
    | 'blockers'
    | 'comments'
    | 'metadata'
    | 'files'
    | 'validation'
    | 'notes'
    | 'scope'
    | 'risk'
    | 'assignedAgent'
    | 'lease'
    | 'retry'
    | 'verification'
    | 'hallucinationGuard'
    | 'events'
    | 'workspaceId'
    | 'projectId'
  >
>

export type Workspace = {
  id: string
  name: string
  rootDir: string
  createdAt: string
  updatedAt: string
}

export type Project = {
  id: string
  workspaceId: string
  name: string
  rootDir?: string
  boardPath?: string
  createdAt: string
  updatedAt: string
}

export type WorkspaceConfig = {
  version: 1
  workspaces: Workspace[]
  projects: Project[]
}

export function createEmptyKanbanBoard(): KanbanBoard {
  return {
    version: 1,
    tasks: [],
  }
}

export function createEmptyWorkspaceConfig(): WorkspaceConfig {
  return {
    version: 1,
    workspaces: [],
    projects: [],
  }
}
