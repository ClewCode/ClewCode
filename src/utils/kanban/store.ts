import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join, relative, resolve } from 'path'
import { getProjectRoot } from '../../bootstrap/state.js'
import { getErrnoCode } from '../errors.js'
import { safeParseJSON } from '../json.js'
import { jsonStringify } from '../slowOperations.js'
import { renderKanbanMarkdown } from './markdown.js'
import {
  createEmptyKanbanBoard,
  createEmptyWorkspaceConfig,
  KANBAN_DEFAULT_MAX_ATTEMPTS,
  KANBAN_HEARTBEAT_INTERVAL_MS,
  KANBAN_LEASE_TTL_MS,
  KANBAN_ZOMBIE_GRACE_MS,
  type KanbanBoard,
  type KanbanEvent,
  type KanbanEventType,
  type KanbanStatus,
  type KanbanTask,
  type KanbanTaskInput,
  type KanbanTaskUpdate,
  type Project,
  type Workspace,
  type WorkspaceConfig,
} from './types.js'
import {
  validateBoard,
  validateTaskInput,
  validateTaskUpdate,
} from './validation.js'

const BOARD_JSON_RELATIVE = '.claude/tasks/kanban.json'
const BOARD_MD_RELATIVE = '.claude/tasks/kanban.md'

export type KanbanPaths = {
  root: string
  json: string
  markdown: string
}

function assertPathInsideRoot(path: string, root: string): void {
  const rel = relative(root, path)
  if (rel === '' || rel.startsWith('..') || resolve(rel) === rel) {
    throw new Error('Kanban path escaped the workspace')
  }
}

export function getKanbanPaths(cwd = getProjectRoot()): KanbanPaths {
  const root = cwd
  const json = join(root, BOARD_JSON_RELATIVE)
  const markdown = join(root, BOARD_MD_RELATIVE)
  assertPathInsideRoot(json, root)
  assertPathInsideRoot(markdown, root)
  return { root, json, markdown }
}

async function atomicWriteFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tempPath = `${path}.tmp.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}`
  try {
    await writeFile(tempPath, content, { encoding: 'utf8', mode: 0o600 })
    await rename(tempPath, path)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

export async function kanbanBoardExists(cwd = getProjectRoot()): Promise<boolean> {
  try {
    await readFile(getKanbanPaths(cwd).json, { encoding: 'utf8' })
    return true
  } catch (error) {
    if (getErrnoCode(error) === 'ENOENT') return false
    throw error
  }
}

export async function readKanbanBoard(cwd = getProjectRoot()): Promise<KanbanBoard> {
  const content = await readFile(getKanbanPaths(cwd).json, {
    encoding: 'utf8',
  })
  const parsed = safeParseJSON(content, false)
  if (parsed === null) {
    throw new Error('Kanban board JSON is invalid')
  }
  return validateBoard(parsed)
}

export async function writeKanbanBoard(
  board: KanbanBoard,
  cwd = getProjectRoot(),
): Promise<KanbanBoard> {
  const validated = validateBoard(board)
  await atomicWriteFile(
    getKanbanPaths(cwd).json,
    `${jsonStringify(validated, null, 2)}\n`,
  )
  return validated
}

export async function initKanbanBoard(
  cwd = getProjectRoot(),
  options: { overwrite?: boolean } = {},
): Promise<{ board: KanbanBoard; created: boolean }> {
  if (!options.overwrite && (await kanbanBoardExists(cwd))) {
    return { board: await readKanbanBoard(cwd), created: false }
  }
  const board = createEmptyKanbanBoard()
  await writeKanbanBoard(board, cwd)
  return { board, created: true }
}

function createTaskId(now = new Date()): string {
  return `kb-${now.getTime().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function createCommentId(): string {
  return `kc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function taskFromInput(input: KanbanTaskInput, now: string): KanbanTask {
  const validated = validateTaskInput(input)
  const task: KanbanTask = {
    id: createTaskId(new Date(now)),
    title: validated.title.trim(),
    status: validated.status ?? 'todo',
    owner: validated.owner ?? 'ai-orchestrator',
    createdAt: now,
    updatedAt: now,
  }

  if (validated.body) task.body = validated.body
  if (validated.assignee) task.assignee = validated.assignee
  if (validated.priority) task.priority = validated.priority
  if (validated.tags) task.tags = validated.tags
  if (validated.files) task.files = validated.files
  if (validated.validation) task.validation = validated.validation
  if (validated.notes) task.notes = validated.notes
  if (validated.scope) task.scope = validated.scope
  if (validated.risk) task.risk = validated.risk
  if (validated.assignedAgent) task.assignedAgent = validated.assignedAgent

  return task
}

async function readExistingOrEmpty(cwd: string): Promise<KanbanBoard> {
  return (await kanbanBoardExists(cwd))
    ? await readKanbanBoard(cwd)
    : createEmptyKanbanBoard()
}

export async function addKanbanTask(
  input: KanbanTaskInput,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readExistingOrEmpty(cwd)
  const now = new Date().toISOString()
  const task = taskFromInput(input, now)

  // Check file conflicts: if new task has files that overlap with running/ready tasks
  if (task.files && task.files.length > 0 && (task.status === 'running' || task.status === 'ready')) {
    const inProgressTasks = board.tasks.filter(
      t => (t.status === 'running' || t.status === 'ready') && t.id !== task.id
    )
    for (const existing of inProgressTasks) {
      const existingFiles = Array.isArray(existing.files)
        ? existing.files
        : (existing.metadata?.files as string[] ?? [])
      const overlap = task.files.filter(f => existingFiles.includes(f))
      if (overlap.length > 0) {
        throw new Error(
          `File(s) already assigned to task ${existing.id}: ${overlap.join(', ')}`,
        )
      }
    }
  }

  const next = validateBoard({ ...board, tasks: [...board.tasks, task] })
  await writeKanbanBoard(next, cwd)
  return { board: next, task }
}

function findTaskOrThrow(board: KanbanBoard, id: string): number {
  const taskIndex = board.tasks.findIndex(task => task.id === id)
  if (taskIndex === -1) {
    throw new Error(`Kanban task not found: ${id}`)
  }
  return taskIndex
}

async function updateKanbanTask(
  id: string,
  update: KanbanTaskUpdate,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  validateTaskUpdate(update)
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const now = new Date().toISOString()
  const existingTask = board.tasks[taskIndex]
  const task: KanbanTask = {
    ...existingTask,
    ...update,
    title: update.title?.trim() ?? existingTask.title,
    updatedAt: now,
  }
  const tasks = board.tasks.slice()
  tasks[taskIndex] = task
  const next = validateBoard({ ...board, tasks })
  await writeKanbanBoard(next, cwd)
  return { board: next, task }
}

export async function moveKanbanTask(
  id: string,
  status: KanbanStatus,
  cwd = getProjectRoot(),
  update: Omit<KanbanTaskUpdate, 'status'> = {},
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  return updateKanbanTask(id, { ...update, status }, cwd)
}

export async function getKanbanTask(
  id: string,
  cwd = getProjectRoot(),
): Promise<KanbanTask> {
  const board = await readKanbanBoard(cwd)
  return board.tasks[findTaskOrThrow(board, id)]
}

export async function editKanbanTask(
  id: string,
  update: Omit<KanbanTaskUpdate, 'status' | 'owner' | 'assignedAgent'>,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  return updateKanbanTask(id, update, cwd)
}

export async function deleteKanbanTask(
  id: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const tasks = board.tasks.filter(item => item.id !== id)
  const next = validateBoard({ ...board, tasks })
  await writeKanbanBoard(next, cwd)
  return { board: next, task }
}

export async function assignKanbanTask(
  id: string,
  assignedAgent: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  return updateKanbanTask(id, { assignedAgent }, cwd)
}

export async function blockKanbanTask(
  id: string,
  reason: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  if (reason.trim().length === 0) {
    throw new Error('block reason cannot be empty')
  }
  const board = await readKanbanBoard(cwd)
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    throw new Error(`Kanban task not found: ${id}`)
  }
  return updateKanbanTask(
    id,
    {
      status: 'blocked',
      blockedReason: reason.trim(),
      blockers: [...(task.blockers ?? []), reason.trim()],
      blockedFromStatus: task.status,
    },
    cwd,
  )
}

export async function unblockKanbanTask(
  id: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    throw new Error(`Kanban task not found: ${id}`)
  }
  const priorStatus = task.blockedFromStatus ?? 'todo'
  return updateKanbanTask(
    id,
    {
      status: priorStatus,
      blockedReason: undefined,
      blockedFromStatus: undefined,
      blockers: [],
    },
    cwd,
  )
}

export async function completeKanbanTask(
  id: string,
  summary?: string,
  metadata?: Record<string, unknown>,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  // Use verifyAndCompleteTask which handles lease release and hallucination guard
  return verifyAndCompleteTask(id, summary, undefined, cwd)
}

export async function commentKanbanTask(
  id: string,
  author: string,
  body: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  if (!body.trim()) {
    throw new Error('comment body cannot be empty')
  }
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const now = new Date().toISOString()
  const comment = {
    id: createCommentId(),
    author: author || 'user',
    body: body.trim(),
    createdAt: now,
  }
  const comments = [...(task.comments ?? []), comment]
  const updatedTask: KanbanTask = { ...task, comments, updatedAt: now }
  return withAppendEvent(board, taskIndex, id, updatedTask, 'commented', author, `Comment: ${body.trim()}`, cwd)
}

export async function archiveKanbanTask(
  id: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  return updateKanbanTask(id, { status: 'archived' }, cwd)
}

export async function listKanbanTasks(
  cwd = getProjectRoot(),
): Promise<KanbanTask[]> {
  const board = await readKanbanBoard(cwd)
  return board.tasks.filter(t => t.status !== 'archived')
}

export type KanbanFileConflict = {
  file: string
  tasks: Array<Pick<KanbanTask, 'id' | 'title' | 'status' | 'assignee'>>
}

export function detectKanbanFileConflicts(
  board: KanbanBoard,
): KanbanFileConflict[] {
  const fileMap = new Map<string, KanbanTask[]>()

  for (const task of board.tasks) {
    const status = task.status
    if (status !== 'running' && status !== 'ready') continue

    const files = Array.isArray(task.files)
      ? task.files
      : (task.metadata?.files as string[] ?? [])

    for (const file of files) {
      const existing = fileMap.get(file) ?? []
      existing.push(task)
      fileMap.set(file, existing)
    }
  }

  const conflicts: KanbanFileConflict[] = []
  for (const [file, tasks] of fileMap) {
    if (tasks.length > 1) {
      conflicts.push({
        file,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assignee: t.assignedAgent ?? (t.metadata?.assignedAgent as string) ?? '',
        })),
      })
    }
  }

  return conflicts
}

export type KanbanFileListing = {
  file: string
  taskId: string
  status: KanbanStatus
  assignee: string
}

export function listKanbanFiles(board: KanbanBoard): KanbanFileListing[] {
  const listings: KanbanFileListing[] = []

  for (const task of board.tasks) {
    const files = Array.isArray(task.files)
      ? task.files
      : (task.metadata?.files as string[] ?? [])

    const assignee = task.assignedAgent ?? (task.metadata?.assignedAgent as string) ?? ''

    for (const file of files) {
      listings.push({
        file,
        taskId: task.id,
        status: task.status,
        assignee,
      })
    }
  }

  return listings
}

export async function exportKanbanMarkdown(
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; path: string }> {
  const board = await readKanbanBoard(cwd)
  const paths = getKanbanPaths(cwd)
  await atomicWriteFile(paths.markdown, renderKanbanMarkdown(board))
  return { board, path: paths.markdown }
}

// ─── Lease / Claim / Heartbeat ───────────────────────────

function createLeaseId(): string {
  return `kl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEventId(): string {
  return `ke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function claimKanbanTask(
  id: string,
  workerId: string,
  claimedBy: string,
  cwd = getProjectRoot(),
  options?: { ttlMs?: number; heartbeatIntervalMs?: number },
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  if (task.status !== 'ready' && task.status !== 'todo') {
    throw new Error(`Cannot claim task in status "${task.status}": must be "ready" or "todo"`)
  }
  const now = new Date()
  const ttlMs = options?.ttlMs ?? KANBAN_LEASE_TTL_MS
  const heartbeatMs = options?.heartbeatIntervalMs ?? KANBAN_HEARTBEAT_INTERVAL_MS
  const lease: KanbanTask['lease'] = {
    leaseId: createLeaseId(),
    workerId,
    claimedBy,
    claimedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    heartbeatIntervalMs: heartbeatMs,
    status: 'active',
  }
  return withAppendEvent(board, taskIndex, id, {
    ...task,
    status: 'running',
    lease,
  }, 'claimed', claimedBy, `Task claimed by ${claimedBy} (worker: ${workerId})`, cwd)
}

export async function heartbeatKanbanTask(
  id: string,
  workerId: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  if (!task.lease) {
    throw new Error(`Task ${id} has no lease to heartbeat`)
  }
  if (task.lease.workerId !== workerId) {
    throw new Error(`Heartbeat worker mismatch: "${workerId}" does not own lease for task ${id}`)
  }
  const now = new Date()
  const ttlMs = KANBAN_LEASE_TTL_MS
  const updatedLease = {
    ...task.lease,
    lastHeartbeatAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    status: 'active' as const,
  }
  return withAppendEvent(board, taskIndex, id, { ...task, lease: updatedLease }, 'heartbeat', workerId, 'Heartbeat received', cwd)
}

export async function releaseKanbanTask(
  id: string,
  workerId: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  if (!task.lease) {
    throw new Error(`Task ${id} has no lease to release`)
  }
  if (task.lease.workerId !== workerId) {
    throw new Error(`Release worker mismatch: "${workerId}" does not own lease for task ${id}`)
  }
  const updated: KanbanTask = { ...task, lease: undefined }
  // If the task is running and we release, go back to ready
  if (updated.status === 'running') {
    updated.status = 'ready'
  }
  return withAppendEvent(board, taskIndex, id, updated, 'released', workerId, `Lease released by ${workerId}`, cwd)
}

export async function reclaimKanbanTask(
  id: string,
  newWorkerId: string,
  claimedBy: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const now = new Date()
  const lease: KanbanTask['lease'] = {
    leaseId: createLeaseId(),
    workerId: newWorkerId,
    claimedBy,
    claimedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + KANBAN_LEASE_TTL_MS).toISOString(),
    heartbeatIntervalMs: KANBAN_HEARTBEAT_INTERVAL_MS,
    status: 'active',
  }
  return withAppendEvent(board, taskIndex, id, {
    ...task,
    status: 'running',
    lease,
  }, 'reclaimed', claimedBy, `Task reclaimed by ${claimedBy} (worker: ${newWorkerId})`, cwd)
}

// ─── Zombie Detection ────────────────────────────────────

function isStale(lease: NonNullable<KanbanTask['lease']>, now: Date): boolean {
  return new Date(lease.expiresAt) < now
}

function isZombie(lease: NonNullable<KanbanTask['lease']>, now: Date): boolean {
  if (!isStale(lease, now)) return false
  const expiredSince = now.getTime() - new Date(lease.expiresAt).getTime()
  return expiredSince >= KANBAN_ZOMBIE_GRACE_MS
}

export function detectZombieTasks(board: KanbanBoard, now?: Date): KanbanTask[] {
  const nowDate = now ?? new Date()
  return board.tasks.filter(t => {
    if (!t.lease || t.status !== 'running') return false
    return isZombie(t.lease, nowDate)
  })
}

export function listZombieTasks(board: KanbanBoard, now?: Date): KanbanTask[] {
  return detectZombieTasks(board, now)
}

export function listStaleTasks(board: KanbanBoard, now?: Date): KanbanTask[] {
  const nowDate = now ?? new Date()
  return board.tasks.filter(t => {
    if (!t.lease || t.status !== 'running') return false
    return isStale(t.lease, nowDate) && !isZombie(t.lease, nowDate)
  })
}

// ─── Retry / Fail ─────────────────────────────────────────

export async function failKanbanTask(
  id: string,
  reason: string,
  workerId?: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const now = new Date()
  const actor = workerId ?? 'system'
  const retry: NonNullable<KanbanTask['retry']> = task.retry ?? {
    attempt: 0,
    maxAttempts: KANBAN_DEFAULT_MAX_ATTEMPTS,
    strategy: 'none',
  }
  retry.lastError = reason

  const updated: KanbanTask = {
    ...task,
    status: 'done',
    retry,
    lease: undefined,
  }

  return withAppendEvent(board, taskIndex, id, updated, 'failed', actor, `Task failed: ${reason}`, cwd, { error: reason })
}

export async function retryKanbanTask(
  id: string,
  workerId?: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const actor = workerId ?? 'system'

  const retry: NonNullable<KanbanTask['retry']> = task.retry ?? {
    attempt: 0,
    maxAttempts: KANBAN_DEFAULT_MAX_ATTEMPTS,
    strategy: 'none',
  }

  if (retry.attempt >= retry.maxAttempts) {
    throw new Error(`Task ${id} has reached max retry attempts (${retry.maxAttempts})`)
  }

  retry.attempt++
  retry.lastError = undefined

  if (retry.strategy === 'exponential') {
    const delayMs = Math.min(1000 * Math.pow(2, retry.attempt), 60000)
    retry.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
  } else if (retry.strategy === 'fixed') {
    retry.nextRetryAt = new Date(Date.now() + 30000).toISOString()
  }

  const updated: KanbanTask = {
    ...task,
    status: 'ready',
    retry,
    lease: undefined,
  }

  return withAppendEvent(board, taskIndex, id, updated, 'retried', actor, `Retry attempt ${retry.attempt}/${retry.maxAttempts}`, cwd, { attempt: retry.attempt, maxAttempts: retry.maxAttempts })
}

// ─── Verification / Evidence ──────────────────────────────

function createEvidenceId(): string {
  return `kev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function addEvidenceToTask(
  id: string,
  evidenceType: KanbanTask['verification']['evidence'][0]['type'],
  label: string,
  cwd = getProjectRoot(),
  options?: { content?: string; path?: string },
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]

  const verification: NonNullable<KanbanTask['verification']> = task.verification ?? {
    evidence: [],
  }
  const evidence = verification.evidence ?? []
  const item: NonNullable<KanbanTask['verification']>['evidence'][0] = {
    id: createEvidenceId(),
    type: evidenceType,
    label,
    content: options?.content,
    path: options?.path,
    createdAt: new Date().toISOString(),
  }
  evidence.push(item)
  verification.evidence = evidence
  verification.lastRunCommands = [...(verification.lastRunCommands ?? []), label]

  const updated: KanbanTask = { ...task, verification }
  return withAppendEvent(board, taskIndex, id, updated, 'verification_added', 'user', `Evidence added: ${label} (${evidenceType})`, cwd, { evidenceId: item.id, evidenceType, label })
}

export async function verifyKanbanTask(
  id: string,
  passed: boolean,
  summary?: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]

  const verification: NonNullable<KanbanTask['verification']> = task.verification ?? {}
  verification.passed = passed
  if (summary) verification.summary = summary

  const updated: KanbanTask = { ...task, verification }
  const eventType: KanbanEventType = passed ? 'verification_passed' : 'verification_failed'
  return withAppendEvent(board, taskIndex, id, updated, eventType, 'user', `Verification ${passed ? 'passed' : 'failed'}${summary ? ': ' + summary : ''}`, cwd, { passed, summary })
}

export async function verifyAndCompleteTask(
  id: string,
  summary?: string,
  workerId?: string,
  cwd = getProjectRoot(),
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const board = await readKanbanBoard(cwd)
  const taskIndex = findTaskOrThrow(board, id)
  const task = board.tasks[taskIndex]
  const now = new Date().toISOString()
  const actor = workerId ?? 'user'

  // Check hallucination guard
  const guard = task.hallucinationGuard
  if (guard) {
    if (guard.expectedFiles && guard.expectedFiles.length > 0 && (!guard.changedFiles || guard.changedFiles.length === 0)) {
      guard.mismatchDetected = true
      guard.recoveryAction = 'ask_human'
    }
    if (guard.claimedCommands && guard.verifiedCommands) {
      const claimed = new Set(guard.claimedCommands)
      const verified = new Set(guard.verifiedCommands)
      if (guard.claimedCommands.some(c => !verified.has(c))) {
        guard.mismatchDetected = true
        guard.recoveryAction = 'ask_human'
      }
    }
  }

  // Check if verification evidence is needed
  const verification = task.verification
  const required = verification?.requiredCommands
  if (required && required.length > 0) {
    const ran = verification?.lastRunCommands ?? []
    const missing = required.filter(c => !ran.some(r => r.includes(c)))
    if (missing.length > 0) {
      // Move to review instead of done
      const reviewTask: KanbanTask = {
        ...task,
        status: 'ready',
        verification,
        hallucinationGuard: guard,
        lease: undefined,
      }
      return withAppendEvent(board, taskIndex, id, reviewTask,
        'hallucination_detected', actor,
        `Missing verification commands: ${missing.join(', ')}. Moved to review.`, cwd, { missing })
    }
  }

  if (guard?.mismatchDetected) {
    const reviewTask: KanbanTask = {
      ...task,
      status: 'ready',
      verification,
      hallucinationGuard: guard,
      lease: undefined,
    }
    return withAppendEvent(board, taskIndex, id, reviewTask,
      'hallucination_detected', actor,
      `Mismatch detected in task claims. Moved to review.`, cwd, { mismatch: true })
  }

  const completedTask: KanbanTask = {
    ...task,
    status: 'done',
    completedAt: now,
    verification: verification ? { ...verification, passed: verification.passed ?? true, summary: verification.summary ?? summary } : undefined,
    hallucinationGuard: guard,
    lease: undefined,
  }
  return withAppendEvent(board, taskIndex, id, completedTask, 'completed', actor, summary ?? 'Task completed', cwd, { summary })
}

// ─── Events ───────────────────────────────────────────────

export function getTaskEvents(board: KanbanBoard, id: string): KanbanEvent[] {
  const task = board.tasks.find(t => t.id === id)
  if (!task) throw new Error(`Kanban task not found: ${id}`)
  return task.events ?? []
}

async function withAppendEvent(
  board: KanbanBoard,
  taskIndex: number,
  taskId: string,
  updatedTask: KanbanTask,
  eventType: KanbanEventType,
  actor: string,
  message: string,
  cwd: string,
  metadata?: Record<string, unknown>,
): Promise<{ board: KanbanBoard; task: KanbanTask }> {
  const events = updatedTask.events ?? []
  const event: KanbanEvent = {
    id: createEventId(),
    taskId,
    type: eventType,
    actor,
    message,
    metadata,
    createdAt: new Date().toISOString(),
  }
  updatedTask.events = [...events, event]
  updatedTask.updatedAt = new Date().toISOString()

  const tasks = board.tasks.slice()
  tasks[taskIndex] = updatedTask
  const next = validateBoard({ ...board, tasks })
  await writeKanbanBoard(next, cwd)
  return { board: next, task: next.tasks[taskIndex] }
}

// ─── Workspace / Project ──────────────────────────────────

const WORKSPACE_CONFIG_RELATIVE = '.claude/tasks/workspace.json'

function getWorkspaceConfigPath(cwd: string): string {
  return join(cwd, WORKSPACE_CONFIG_RELATIVE)
}

async function getWorkspaceConfig(cwd: string): Promise<WorkspaceConfig> {
  const configPath = getWorkspaceConfigPath(cwd)
  try {
    const content = await readFile(configPath, { encoding: 'utf8' })
    const parsed = safeParseJSON(content, false)
    if (parsed && typeof parsed === 'object' && parsed.version === 1) {
      return parsed as WorkspaceConfig
    }
  } catch (error) {
    if (getErrnoCode(error) !== 'ENOENT') throw error
  }
  return createEmptyWorkspaceConfig()
}

async function saveWorkspaceConfig(config: WorkspaceConfig, cwd: string): Promise<void> {
  const configPath = getWorkspaceConfigPath(cwd)
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 })
  await atomicWriteFile(configPath, `${jsonStringify(config, null, 2)}\n`)
}

export async function ensureDefaultWorkspace(cwd: string): Promise<Workspace> {
  const config = await getWorkspaceConfig(cwd)
  let ws = config.workspaces.find(w => w.rootDir === cwd)
  if (!ws) {
    const now = new Date().toISOString()
    ws = {
      id: `ws-${Date.now().toString(36)}`,
      name: 'default',
      rootDir: cwd,
      createdAt: now,
      updatedAt: now,
    }
    config.workspaces.push(ws)
    // Also create a default project
    const proj: Project = {
      id: `proj-${Date.now().toString(36)}`,
      workspaceId: ws.id,
      name: 'default',
      rootDir: cwd,
      createdAt: now,
      updatedAt: now,
    }
    config.projects.push(proj)
    await saveWorkspaceConfig(config, cwd)
  }
  return ws
}

export async function getDefaultProject(cwd: string): Promise<Project> {
  const config = await getWorkspaceConfig(cwd)
  const ws = config.workspaces.find(w => w.rootDir === cwd)
  if (!ws) {
    const workspace = await ensureDefaultWorkspace(cwd)
    const cfg = await getWorkspaceConfig(cwd)
    return cfg.projects.find(p => p.workspaceId === workspace.id)!
  }
  const project = config.projects.find(p => p.workspaceId === ws.id)
  if (!project) {
    // Create default project for this workspace
    const now = new Date().toISOString()
    const proj: Project = {
      id: `proj-${Date.now().toString(36)}`,
      workspaceId: ws.id,
      name: 'default',
      rootDir: cwd,
      createdAt: now,
      updatedAt: now,
    }
    config.projects.push(proj)
    await saveWorkspaceConfig(config, cwd)
    return proj
  }
  return project
}

export async function listWorkspaces(cwd = getProjectRoot()): Promise<Workspace[]> {
  const config = await getWorkspaceConfig(cwd)
  return config.workspaces
}

export async function createWorkspace(
  name: string,
  rootDir: string,
  cwd = getProjectRoot(),
): Promise<Workspace> {
  const config = await getWorkspaceConfig(cwd)
  const now = new Date().toISOString()
  const ws: Workspace = {
    id: `ws-${Date.now().toString(36)}`,
    name,
    rootDir,
    createdAt: now,
    updatedAt: now,
  }
  config.workspaces.push(ws)
  await saveWorkspaceConfig(config, cwd)
  return ws
}

export async function listProjects(workspaceId?: string, cwd = getProjectRoot()): Promise<Project[]> {
  const config = await getWorkspaceConfig(cwd)
  if (workspaceId) {
    return config.projects.filter(p => p.workspaceId === workspaceId)
  }
  return config.projects
}

export async function createProject(
  workspaceId: string,
  name: string,
  rootDir?: string,
  cwd = getProjectRoot(),
): Promise<Project> {
  const config = await getWorkspaceConfig(cwd)
  const now = new Date().toISOString()
  const proj: Project = {
    id: `proj-${Date.now().toString(36)}`,
    workspaceId,
    name,
    rootDir,
    createdAt: now,
    updatedAt: now,
  }
  config.projects.push(proj)
  await saveWorkspaceConfig(config, cwd)
  return proj
}

export async function getProjectBoardPath(projectId: string, cwd = getProjectRoot()): Promise<string> {
  const config = await getWorkspaceConfig(cwd)
  const project = config.projects.find(p => p.id === projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }
  const projectRoot = project.rootDir ?? cwd
  return join(projectRoot, '.claude/tasks', `kanban-${projectId}.json`)
}

// ─── Check file conflicts (Phase 3: re-export for wider use) ───

export function hasFileConflictWithRunningTasks(
  board: KanbanBoard,
  files: string[],
  excludeTaskId?: string,
): Array<{ taskId: string; file: string }> {
  const conflicts: Array<{ taskId: string; file: string }> = []
  for (const task of board.tasks) {
    if (task.status !== 'running' && task.status !== 'ready') continue
    if (task.id === excludeTaskId) continue
    const taskFiles = Array.isArray(task.files) ? task.files : []
    for (const file of files) {
      if (taskFiles.includes(file)) {
        conflicts.push({ taskId: task.id, file })
      }
    }
  }
  return conflicts
}