import { normalize, sep } from 'path'
import {
  KANBAN_EVENT_TYPES,
  KANBAN_LEASE_STATUSES,
  KANBAN_PRIORITIES,
  KANBAN_RETRY_STRATEGIES,
  KANBAN_RISKS,
  KANBAN_STATUSES,
  LEGACY_PRIORITY_MAP,
  LEGACY_RISK_MAP,
  LEGACY_STATUS_MAP,
  type KanbanBoard,
  type KanbanComment,
  type KanbanEvent,
  type KanbanEventType,
  type KanbanHallucinationGuard,
  type KanbanLease,
  type KanbanLeaseStatus,
  type KanbanPriority,
  type KanbanRetry,
  type KanbanRetryStrategy,
  type KanbanStatus,
  type KanbanTask,
  type KanbanTaskInput,
  type KanbanTaskUpdate,
  type KanbanVerification,
  type KanbanVerificationEvidence,
} from './types.js'

const TASK_ID_PATTERN = /^kb-[a-z0-9]+-[a-z0-9]+$/
const MAX_STRING_LENGTH = 10000

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }
  if (value.includes('\0')) {
    throw new Error(`${field} cannot contain null bytes`)
  }
  if (value.length > MAX_STRING_LENGTH) {
    throw new Error(`${field} is too long`)
  }
}

function assertStringArray(
  value: unknown,
  field: string,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`)
  }
  for (const [index, item] of value.entries()) {
    assertString(item, `${field}[${index}]`)
  }
}

export function migrateStatus(value: unknown): KanbanStatus {
  if (typeof value !== 'string') {
    return 'todo'
  }
  if (KANBAN_STATUSES.includes(value as KanbanStatus)) {
    return value as KanbanStatus
  }
  const mapped = LEGACY_STATUS_MAP[value]
  if (mapped) {
    return mapped
  }
  return 'todo'
}

export function migratePriority(value: unknown): KanbanPriority {
  if (typeof value !== 'string') {
    return 'normal'
  }
  if (KANBAN_PRIORITIES.includes(value as KanbanPriority)) {
    return value as KanbanPriority
  }
  const mapped = LEGACY_PRIORITY_MAP[value]
  if (mapped) {
    return mapped
  }
  return 'normal'
}

export function migrateRisk(value: unknown): KanbanRisk {
  if (typeof value !== 'string') {
    return 'normal'
  }
  if (KANBAN_RISKS.includes(value as KanbanRisk)) {
    return value as KanbanRisk
  }
  const mapped = LEGACY_RISK_MAP[value]
  if (mapped) {
    return mapped
  }
  return 'normal'
}

export function validateStatus(value: unknown): KanbanStatus {
  assertString(value, 'status')
  if (!KANBAN_STATUSES.includes(value as KanbanStatus)) {
    throw new Error(
      `status must be one of: ${KANBAN_STATUSES.map(_ => `"${_}"`).join(', ')}`,
    )
  }
  return value as KanbanStatus
}

export function validatePriority(value: unknown): KanbanPriority {
  assertString(value, 'priority')
  if (!KANBAN_PRIORITIES.includes(value as KanbanPriority)) {
    throw new Error(
      `priority must be one of: ${KANBAN_PRIORITIES.map(_ => `"${_}"`).join(', ')}`,
    )
  }
  return value as KanbanPriority
}

function validateComment(value: unknown, index: number): KanbanComment {
  if (!isRecord(value)) {
    throw new Error(`comments[${index}] must be an object`)
  }
  assertString(value.id, `comments[${index}].id`)
  assertString(value.author, `comments[${index}].author`)
  assertString(value.body, `comments[${index}].body`)
  assertString(value.createdAt, `comments[${index}].createdAt`)
  return {
    id: value.id,
    author: value.author,
    body: value.body,
    createdAt: value.createdAt,
  }
}

function validateMetadata(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`)
  }
  return value
}

function validateTags(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`)
  }
  for (const [index, item] of value.entries()) {
    assertString(item, `${field}[${index}]`)
  }
  return value
}

function migrateTask(value: unknown, index: number): KanbanTask {
  if (!isRecord(value)) {
    throw new Error(`tasks[${index}] must be an object`)
  }

  const id = value.id
  if (typeof id !== 'string' || !TASK_ID_PATTERN.test(id)) {
    throw new Error(`tasks[${index}].id is invalid`)
  }

  const title = value.title
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error(`tasks[${index}].title cannot be empty`)
  }

  const task: KanbanTask = {
    id,
    title: title.trim(),
    status: migrateStatus(value.status),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  }

  if (typeof value.body === 'string') {
    task.body = value.body
  }

  if (typeof value.assignee === 'string') {
    task.assignee = value.assignee
  }

  if (typeof value.owner === 'string') {
    task.owner = value.owner
  }

  if (value.priority !== undefined) {
    task.priority = migratePriority(value.priority)
  }

  if (value.risk !== undefined) {
    task.risk = migrateRisk(value.risk)
  }

  task.tags = validateTags(value.tags, 'tags')

  if (typeof value.completedAt === 'string') {
    task.completedAt = value.completedAt
  }

  if (typeof value.blockedReason === 'string') {
    task.blockedReason = value.blockedReason
  }

  if (Array.isArray(value.comments)) {
    task.comments = value.comments.map((c, i) => validateComment(c, i))
  }

  if (isRecord(value.metadata)) {
    task.metadata = validateMetadata(value.metadata, 'metadata')
  }

  if (typeof value.blockedFromStatus === 'string') {
    task.blockedFromStatus = migrateStatus(value.blockedFromStatus)
  }

  if (Array.isArray(value.blockers)) {
    task.blockers = value.blockers.map(b => {
      assertString(b, 'blockers')
      return b
    })
  }

  if (Array.isArray(value.files)) {
    task.files = value.files.map(f => {
      assertString(f, 'files')
      return f
    })
  }

  if (Array.isArray(value.validation)) {
    task.validation = value.validation.map(v => {
      assertString(v, 'validation')
      return v
    })
  }

  if (typeof value.notes === 'string') {
    task.notes = value.notes
  }

  if (Array.isArray(value.scope)) {
    task.scope = value.scope.map(s => {
      assertString(s, 'scope')
      return s
    })
  }

  if (typeof value.assignedAgent === 'string') {
    task.assignedAgent = value.assignedAgent
  }

  // Phase 3 fields
  if (isRecord(value.lease)) {
    task.lease = value.lease as KanbanLease
  }
  if (isRecord(value.retry)) {
    task.retry = value.retry as KanbanRetry
  }
  if (isRecord(value.verification)) {
    task.verification = value.verification as KanbanVerification
  }
  if (isRecord(value.hallucinationGuard)) {
    task.hallucinationGuard = value.hallucinationGuard as KanbanHallucinationGuard
  }
  if (Array.isArray(value.events)) {
    task.events = value.events as KanbanEvent[]
  }
  if (typeof value.workspaceId === 'string') {
    task.workspaceId = value.workspaceId
  }
  if (typeof value.projectId === 'string') {
    task.projectId = value.projectId
  }

  const legacyFields: Record<string, unknown> = {}
  if (Array.isArray(value.files)) legacyFields.files = value.files
  if (Array.isArray(value.validation)) legacyFields.validation = value.validation
  if (typeof value.notes === 'string') legacyFields.notes = value.notes
  if (Array.isArray(value.scope)) legacyFields.scope = value.scope
  if (typeof value.risk === 'string') legacyFields.risk = value.risk
  if (typeof value.assignedAgent === 'string') legacyFields.assignedAgent = value.assignedAgent

  if (Object.keys(legacyFields).length > 0) {
    task.metadata = { ...legacyFields, ...task.metadata }
  }

  return task
}

export function validateBoard(value: unknown): KanbanBoard {
  if (!isRecord(value)) {
    throw new Error('Kanban board must be an object')
  }
  if (value.version !== 1) {
    throw new Error('Kanban board version must be 1')
  }
  if (!Array.isArray(value.tasks)) {
    throw new Error('Kanban board tasks must be an array')
  }

  const ids = new Set<string>()
  const tasks = value.tasks.map((task, index) => {
    const migrated = migrateTask(task, index)
    if (ids.has(migrated.id)) {
      throw new Error(`duplicate Kanban task id: ${migrated.id}`)
    }
    ids.add(migrated.id)
    return migrated
  })

  return { version: 1, tasks }
}

export function validateTaskInput(input: KanbanTaskInput): KanbanTaskInput {
  assertString(input.title, 'title')
  if (input.title.trim().length === 0) {
    throw new Error('title cannot be empty')
  }
  if (input.status !== undefined) validateStatus(input.status)
  if (input.priority !== undefined) validatePriority(input.priority)
  if (input.body !== undefined) assertString(input.body, 'body')
  if (input.assignee !== undefined) assertString(input.assignee, 'assignee')
  if (input.owner !== undefined) assertString(input.owner, 'owner')
  if (input.tags !== undefined) assertStringArray(input.tags, 'tags')
  if (input.risk !== undefined) input.risk = migrateRisk(input.risk)
  if (input.files !== undefined) assertStringArray(input.files, 'files')
  if (input.validation !== undefined) assertStringArray(input.validation, 'validation')
  if (input.notes !== undefined) assertString(input.notes, 'notes')
  if (input.scope !== undefined) assertStringArray(input.scope, 'scope')
  if (input.assignedAgent !== undefined) assertString(input.assignedAgent, 'assignedAgent')
  return input
}

export function validateTaskUpdate(update: KanbanTaskUpdate): KanbanTaskUpdate {
  if (update.title !== undefined) {
    assertString(update.title, 'title')
    if (update.title.trim().length === 0) {
      throw new Error('title cannot be empty')
    }
  }
  if (update.body !== undefined) assertString(update.body, 'body')
  if (update.status !== undefined) validateStatus(update.status)
  if (update.assignee !== undefined) assertString(update.assignee, 'assignee')
  if (update.owner !== undefined) assertString(update.owner, 'owner')
  if (update.priority !== undefined) validatePriority(update.priority)
  if (update.tags !== undefined) assertStringArray(update.tags, 'tags')
  if (update.completedAt !== undefined) assertString(update.completedAt, 'completedAt')
  if (update.blockedReason !== undefined) assertString(update.blockedReason, 'blockedReason')
  if (update.blockedFromStatus !== undefined) validateStatus(update.blockedFromStatus)
  if (update.blockers !== undefined) assertStringArray(update.blockers, 'blockers')
  if (update.comments !== undefined) {
    if (!Array.isArray(update.comments)) {
      throw new Error('comments must be an array')
    }
    update.comments.forEach((c, i) => validateComment(c, i))
  }
  if (update.metadata !== undefined) {
    validateMetadata(update.metadata, 'metadata')
  }
  return update
}

export function validateRelativeSafePath(path: string, field = 'files'): string {
  assertString(path, field)
  if (path.trim() !== path || path.length === 0) {
    throw new Error(`${field} must be a non-empty relative path`)
  }
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`${field} must be relative`)
  }
  if (path.split(/[\\/]+/).includes('..')) {
    throw new Error(`${field} cannot traverse outside the workspace`)
  }
  const normalized = normalize(path)
  if (
    normalized === '..' ||
    normalized.startsWith(`..${sep}`) ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`${field} cannot traverse outside the workspace`)
  }
  const basename = normalized.split(/[\\/]/).pop() ?? ''
  if (
    basename === '.env' ||
    basename.startsWith('.env.') ||
    basename === 'secrets.json' ||
    basename === 'credentials.json'
  ) {
    throw new Error(`${field} contains sensitive files`)
  }
  return path
}