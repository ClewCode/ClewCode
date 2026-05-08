import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import {
  addKanbanTask,
  addEvidenceToTask,
  archiveKanbanTask,
  blockKanbanTask,
  claimKanbanTask,
  commentKanbanTask,
  completeKanbanTask,
  deleteKanbanTask,
  detectKanbanFileConflicts,
  editKanbanTask,
  exportKanbanMarkdown,
  failKanbanTask,
  getKanbanTask,
  getTaskEvents,
  initKanbanBoard,
  kanbanBoardExists,
  listKanbanFiles,
  listKanbanTasks,
  listProjects,
  listWorkspaces,
  migratePriority,
  migrateRisk,
  migrateStatus,
  moveKanbanTask,
  readKanbanBoard,
  retryKanbanTask,
  unblockKanbanTask,
  verifyKanbanTask,
} from '../../utils/kanban/index.js'
import { openKanbanDashboard } from '../../utils/kanban/server.js'
import type { KanbanPriority, KanbanStatus, KanbanTask, KanbanTaskInput, KanbanTaskUpdate } from '../../utils/kanban/types.js'

type ParsedKanbanCommand =
  | { type: 'help' }
  | { type: 'init' }
  | { type: 'list'; projectId?: string }
  | { type: 'export' }
  | { type: 'open' }
  | { type: 'show'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'assign'; id: string; assignedAgent: string }
  | { type: 'block'; id: string; reason: string }
  | { type: 'unblock'; id: string }
  | { type: 'complete'; id: string; summary?: string }
  | { type: 'comment'; id: string; body: string }
  | { type: 'archive'; id: string }
  | { type: 'conflicts' }
  | { type: 'files' }
  | { type: 'add'; input: KanbanTaskInput }
  | {
      type: 'move'
      id: string
      status: KanbanStatus
      update: Omit<KanbanTaskUpdate, 'status'>
    }
  | {
      type: 'edit'
      id: string
      update: KanbanTaskUpdate
    }
  // Phase 3
  | { type: 'retry'; id: string }
  | { type: 'fail'; id: string; reason: string }
  | { type: 'verify'; id: string; passed: boolean; summary?: string }
  | { type: 'evidence'; id: string; evidenceType: string; label: string; content?: string }
  | { type: 'events'; id: string }
  | { type: 'workspace'; action: 'list' | 'use'; workspaceId?: string }
  | { type: 'project'; action: 'list' | 'use'; projectId?: string }

const HELP = `Usage:
/kanban init
/kanban list
/kanban show <id>
/kanban create "title" [--body "description"] [--status <status>] [--priority <priority>] [--assignee <name>] [--owner <name>] [--tags <tag1,tag2>]
/kanban move <id> <status>
/kanban edit <id> [--title <title>] [--body <body>] [--priority <priority>] [--assignee <name>] [--tags <tag1,tag2>]
/kanban delete <id>
/kanban assign <id> <assignee|none>
/kanban block <id> --reason <reason>
/kanban unblock <id>
/kanban complete <id> "summary"
/kanban comment <id> "comment text"
/kanban archive <id>
/kanban conflicts
/kanban files
/kanban open
/kanban export
/kanban retry <id>
/kanban fail <id> "reason"
/kanban verify <id> --cmd "command"
/kanban evidence <id> --type command --label "label"
/kanban events <id>
/kanban workspace list
/kanban project list`

const STATUSES = ['triage', 'todo', 'ready', 'running', 'blocked', 'done', 'archived']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

function tokenizeArgs(args: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of args.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaping) current += '\\'
  if (quote) throw new Error('Unclosed quote in /kanban arguments')
  if (current.length > 0) tokens.push(current)
  return tokens
}

function readFlagValue(tokens: string[], index: number, flag: string): string {
  const value = tokens[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseAdd(tokens: string[]): ParsedKanbanCommand {
  const titleParts: string[] = []
  const input: KanbanTaskInput = {
    title: '',
    scope: [],
    files: [],
    validation: [],
  }

  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token.startsWith('--')) {
      titleParts.push(token)
      continue
    }
    const value = readFlagValue(tokens, index, token)
    index++
    switch (token) {
      case '--status':
        input.status = migrateStatus(value)
        break
      case '--priority':
        input.priority = migratePriority(value)
        break
      case '--risk':
        input.risk = migrateRisk(value)
        break
      case '--owner':
        input.owner = value
        break
      case '--agent':
      case '--assigned-agent':
        input.assignedAgent = value
        break
      case '--scope':
        input.scope?.push(value)
        break
      case '--file':
        input.files?.push(...splitCommaSeparated(value))
        break
      case '--validation':
        input.validation?.push(value)
        break
      case '--notes':
        input.notes = value
        break
      default:
        throw new Error(`Unknown /kanban add flag: ${token}`)
    }
  }

  input.title = titleParts.join(' ')
  return { type: 'add', input }
}

function parseMove(tokens: string[]): ParsedKanbanCommand {
  const id = tokens[1]
  const statusValue = tokens[2]
  if (!id || !statusValue) {
    throw new Error('/kanban move requires <id> and <status>')
  }

  const update: Omit<KanbanTaskUpdate, 'status'> = {}
  for (let index = 3; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected /kanban move argument: ${token}`)
    }
    const value = readFlagValue(tokens, index, token)
    index++
    switch (token) {
      case '--owner':
        update.owner = value
        break
      case '--agent':
      case '--assigned-agent':
        update.assignedAgent = value
        break
      case '--notes':
        update.notes = value
        break
      default:
        throw new Error(`Unknown /kanban move flag: ${token}`)
    }
  }

  return { type: 'move', id, status: migrateStatus(statusValue), update }
}

function parseEdit(tokens: string[]): ParsedKanbanCommand {
  const id = tokens[1]
  if (!id) {
    throw new Error('/kanban edit requires <id>')
  }

  const update: Omit<
    KanbanTaskUpdate,
    'status' | 'owner' | 'assignedAgent'
  > = {}
  const files: string[] = []
  const validation: string[] = []
  let sawFile = false
  let sawValidation = false

  for (let index = 2; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected /kanban edit argument: ${token}`)
    }
    switch (token) {
      case '--title':
        update.title = readFlagValue(tokens, index, token)
        index++
        break
      case '--priority':
        update.priority = migratePriority(readFlagValue(tokens, index, token))
        index++
        break
      case '--risk':
        update.risk = readFlagValue(tokens, index, token)
        index++
        break
      case '--file':
        files.push(...splitCommaSeparated(readFlagValue(tokens, index, token)))
        sawFile = true
        index++
        break
      case '--validation':
        validation.push(readFlagValue(tokens, index, token))
        sawValidation = true
        index++
        break
      case '--clear-files':
        update.files = []
        break
      case '--clear-validation':
        update.validation = []
        break
      default:
        throw new Error(`Unknown /kanban edit flag: ${token}`)
    }
  }

  if (sawFile) update.files = files
  if (sawValidation) update.validation = validation
  if (Object.keys(update).length === 0) {
    throw new Error('/kanban edit requires at least one option')
  }
  return { type: 'edit', id, update }
}

function parseBlock(tokens: string[]): ParsedKanbanCommand {
  const id = tokens[1]
  if (!id) {
    throw new Error('/kanban block requires <id>')
  }
  let reason = ''
  for (let index = 2; index < tokens.length; index++) {
    const token = tokens[index]
    if (token !== '--reason') {
      throw new Error(`Unknown /kanban block flag: ${token}`)
    }
    reason = readFlagValue(tokens, index, token)
    index++
  }
  if (!reason) {
    throw new Error('/kanban block requires --reason <reason>')
  }
  return { type: 'block', id, reason }
}

function parseIdCommand(
  tokens: string[],
  type: 'show' | 'delete' | 'unblock',
): ParsedKanbanCommand {
  const id = tokens[1]
  if (!id || tokens.length > 2) {
    throw new Error(`/kanban ${type} requires exactly <id>`)
  }
  return { type, id }
}

export function parseKanbanArgs(args: string): ParsedKanbanCommand {
  const tokens = tokenizeArgs(args)
  const subcommand = tokens[0]?.toLowerCase()
  switch (subcommand) {
    case undefined:
    case '':
    case 'help':
    case '--help':
    case '-h':
      return { type: 'help' }
    case 'init':
      return { type: 'init' }
    case 'list':
      return parseList(tokens)
    case 'show':
      return parseIdCommand(tokens, 'show')
    case 'open':
      return { type: 'open' }
    case 'create':
    case 'add':
      return parseAdd(tokens)
    case 'move':
      return parseMove(tokens)
    case 'edit':
      return parseEdit(tokens)
    case 'delete':
      return parseIdCommand(tokens, 'delete')
    case 'assign': {
      const id = tokens[1]
      const assignedAgent = tokens[2]
      if (!id || !assignedAgent || tokens.length > 3) {
        throw new Error('/kanban assign requires <id> and <assignee|none>')
      }
      return {
        type: 'assign',
        id,
        assignedAgent: assignedAgent.toLowerCase() === 'none' ? '' : assignedAgent,
      }
    }
    case 'block':
      return parseBlock(tokens)
    case 'unblock':
      return parseIdCommand(tokens, 'unblock')
    case 'complete':
    case 'done': {
      const id = tokens[1]
      const summary = tokens.slice(2).join(' ')
      if (!id) {
        throw new Error('/kanban complete requires <id>')
      }
      return { type: 'complete', id, summary: summary || undefined }
    }
    case 'comment':
    case 'note': {
      const id = tokens[1]
      const body = tokens.slice(2).join(' ')
      if (!id) {
        throw new Error('/kanban comment requires <id> and <comment>')
      }
      if (!body) {
        throw new Error('/kanban comment requires <comment>')
      }
      return { type: 'comment', id, body }
    }
    case 'archive': {
      const id = tokens[1]
      if (!id) {
        throw new Error('/kanban archive requires <id>')
      }
      return { type: 'archive', id }
    }
    case 'conflicts':
      return { type: 'conflicts' }
    case 'files':
      return { type: 'files' }
    case 'export':
      return { type: 'export' }
    case 'retry': {
      const id = tokens[1]
      if (!id) throw new Error('/kanban retry requires <id>')
      return { type: 'retry', id }
    }
    case 'fail': {
      const id = tokens[1]
      const reason = tokens.slice(2).join(' ')
      if (!id || !reason) throw new Error('/kanban fail requires <id> and <reason>')
      return { type: 'fail', id, reason }
    }
    case 'verify': {
      const id = tokens[1]
      if (!id) throw new Error('/kanban verify requires <id>')
      let passed = true
      let summary: string | undefined
      for (let i = 2; i < tokens.length; i++) {
        if (tokens[i] === '--fail') passed = false
        else if (tokens[i] === '--cmd') summary = readFlagValue(tokens, i, tokens[i])
        else summary = tokens[i]
      }
      return { type: 'verify', id, passed, summary }
    }
    case 'evidence': {
      const id = tokens[1]
      if (!id) throw new Error('/kanban evidence requires <id>')
      let evidenceType = 'manual'
      let label = ''
      let content: string | undefined
      for (let i = 2; i < tokens.length; i++) {
        if (tokens[i] === '--type') evidenceType = readFlagValue(tokens, i, tokens[i])
        else if (tokens[i] === '--label') label = readFlagValue(tokens, i, tokens[i])
        else if (tokens[i] === '--content') content = readFlagValue(tokens, i, tokens[i])
      }
      if (!label) throw new Error('/kanban evidence requires --label')
      return { type: 'evidence', id, evidenceType, label, content }
    }
    case 'events': {
      const id = tokens[1]
      if (!id) throw new Error('/kanban events requires <id>')
      return { type: 'events', id }
    }
    case 'workspace': {
      const action = tokens[1] as 'list' | 'use' | undefined
      if (action === 'list') return { type: 'workspace', action: 'list' }
      if (action === 'use') return { type: 'workspace', action: 'use', workspaceId: tokens[2] }
      throw new Error('/kanban workspace requires list|use')
    }
    case 'project': {
      const action = tokens[1] as 'list' | 'use' | undefined
      if (action === 'list') return { type: 'project', action: 'list' }
      if (action === 'use') return { type: 'project', action: 'use', projectId: tokens[2] }
      throw new Error('/kanban project requires list|use')
    }
    default:
      throw new Error(`Unknown /kanban subcommand: ${tokens[0]}`)
  }
}

function parseList(tokens: string[]): ParsedKanbanCommand {
  let projectId: string | undefined
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === '--project') {
      projectId = readFlagValue(tokens, i, tokens[i])
      i++
    }
  }
  return { type: 'list', projectId }
}

function formatArray(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '-'
}

function formatTaskDetails(task: KanbanTask): string {
  const lines = [
    `id: ${task.id}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
  ]
  if (task.body) lines.push(`body: ${task.body}`)
  if (task.priority) lines.push(`priority: ${task.priority}`)
  if (task.assignee) lines.push(`assignee: ${task.assignee}`)
  if (task.owner) lines.push(`owner: ${task.owner}`)
  if (task.tags?.length) lines.push(`tags: ${task.tags.join(', ')}`)
  if (task.blockedReason) lines.push(`blocked: ${task.blockedReason}`)
  if (task.completedAt) lines.push(`completed: ${task.completedAt}`)
  if (task.lease) {
    lines.push(`lease: worker=${task.lease.workerId} expires=${task.lease.expiresAt} status=${task.lease.status}`)
  }
  if (task.retry) {
    lines.push(`retry: attempt=${task.retry.attempt}/${task.retry.maxAttempts} strategy=${task.retry.strategy}`)
    if (task.retry.lastError) lines.push(`lastError: ${task.retry.lastError}`)
  }
  if (task.verification) {
    if (task.verification.passed !== undefined) lines.push(`verification: ${task.verification.passed ? 'PASSED' : 'FAILED'}`)
    if (task.verification.summary) lines.push(`verificationSummary: ${task.verification.summary}`)
    if (task.verification.evidence?.length) {
      lines.push('evidence:')
      for (const e of task.verification.evidence) {
        lines.push(`  - ${e.type}: ${e.label}${e.content ? ' (' + e.content + ')' : ''}`)
      }
    }
  }
  if (task.comments?.length) {
    lines.push('comments:')
    for (const c of task.comments) {
      lines.push(`  - ${c.author} (${c.createdAt}): ${c.body}`)
    }
  }
  if (task.events?.length) {
    lines.push('events:')
    for (const e of task.events.slice(-5)) {
      lines.push(`  - [${e.type}] ${e.actor}: ${e.message} (${e.createdAt})`)
    }
  }
  lines.push(`created: ${task.createdAt}`)
  lines.push(`updated: ${task.updatedAt}`)
  return lines.join('\n')
}

function formatTaskLine(task: KanbanTask): string {
  const assignee = task.assignee ? ` @${task.assignee}` : ''
  const priority = task.priority ? ` [${task.priority}]` : ''
  const leaseInfo = task.lease ? ` [lease:${task.lease.workerId}]` : ''
  const retryInfo = task.retry && task.retry.attempt > 0 ? ` [retry:${task.retry.attempt}/${task.retry.maxAttempts}]` : ''
  return `- ${task.id} ${task.status}${priority}${leaseInfo}${retryInfo} ${task.title}${assignee}`
}

async function renderList(projectId?: string): Promise<string> {
  if (!(await kanbanBoardExists())) {
    return 'No Kanban board found. Run /kanban init to create one.'
  }
  let tasks = await listKanbanTasks()
  if (projectId) {
    tasks = tasks.filter(t => t.projectId === projectId || !t.projectId)
  }
  if (tasks.length === 0) {
    return 'Kanban board is empty.'
  }
  return tasks.map(formatTaskLine).join('\n')
}

async function renderConflicts(): Promise<string> {
  if (!(await kanbanBoardExists())) {
    return 'No Kanban board found. Run /kanban init to create one.'
  }
  const conflicts = detectKanbanFileConflicts(await readKanbanBoard())
  if (conflicts.length === 0) return 'No conflicts.'
  return conflicts
    .map(conflict => {
      const tasks = conflict.tasks
        .map(task => `${task.id} agent=${task.assignedAgent || '-'}`)
        .join(', ')
      return `- ${conflict.file}: ${tasks}`
    })
    .join('\n')
}

async function renderFiles(): Promise<string> {
  if (!(await kanbanBoardExists())) {
    return 'No Kanban board found. Run /kanban init to create one.'
  }
  const files = listKanbanFiles(await readKanbanBoard())
  if (files.length === 0) return 'No declared files.'
  return files
    .map(
      file =>
        `- ${file.file}: ${file.taskId} [${file.status}] agent=${file.assignedAgent || '-'}`,
    )
    .join('\n')
}

async function renderEvents(id: string): Promise<string> {
  const board = await readKanbanBoard()
  const events = getTaskEvents(board, id)
  if (events.length === 0) return `No events for task ${id}.`
  return events.map(e => {
    const meta = e.metadata ? ` ${JSON.stringify(e.metadata)}` : ''
    return `[${e.createdAt}] ${e.type} by ${e.actor}: ${e.message}${meta}`
  }).join('\n')
}

export async function call(
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> {
  try {
    const command = parseKanbanArgs(args)
    switch (command.type) {
      case 'help':
        return { type: 'text', value: HELP }
      case 'init': {
        const { created } = await initKanbanBoard()
        return {
          type: 'text',
          value: created
            ? 'Initialized Kanban board at .claude/tasks/kanban.json'
            : 'Kanban board already exists at .claude/tasks/kanban.json',
        }
      }
      case 'list':
        return { type: 'text', value: await renderList(command.projectId) }
      case 'show':
        return { type: 'text', value: formatTaskDetails(await getKanbanTask(command.id)) }
      case 'add': {
        const { task } = await addKanbanTask(command.input)
        return {
          type: 'text',
          value: `Added Kanban task ${task.id}: ${task.title}`,
        }
      }
      case 'move': {
        const { task } = await moveKanbanTask(
          command.id,
          command.status,
          undefined,
          command.update,
        )
        return {
          type: 'text',
          value: `Moved Kanban task ${task.id} to ${task.status}`,
        }
      }
      case 'edit': {
        const { task } = await editKanbanTask(command.id, command.update)
        return {
          type: 'text',
          value: `Edited Kanban task ${task.id}: ${task.title}`,
        }
      }
      case 'delete': {
        const { task } = await deleteKanbanTask(command.id)
        return {
          type: 'text',
          value: `Deleted Kanban task ${task.id}: ${task.title}`,
        }
      }
      case 'assign': {
        const { task } = await assignKanbanTask(command.id, command.assignedAgent)
        return {
          type: 'text',
          value: task.assignedAgent
            ? `Assigned Kanban task ${task.id} to ${task.assignedAgent}`
            : `Cleared agent assignment for Kanban task ${task.id}`,
        }
      }
      case 'block': {
        const { task } = await blockKanbanTask(command.id, command.reason)
        return {
          type: 'text',
          value: `Blocked Kanban task ${task.id}: ${command.reason}`,
        }
      }
      case 'unblock': {
        const { task } = await unblockKanbanTask(command.id)
        return {
          type: 'text',
          value: `Unblocked Kanban task ${task.id}; status is ${task.status}`,
        }
      }
      case 'complete': {
        const { task } = await completeKanbanTask(command.id, command.summary)
        return {
          type: 'text',
          value: `Completed Kanban task ${task.id}: ${task.title}`,
        }
      }
      case 'comment': {
        const { task } = await commentKanbanTask(command.id, 'user', command.body)
        return {
          type: 'text',
          value: `Added comment to Kanban task ${task.id}`,
        }
      }
      case 'archive': {
        const { task } = await archiveKanbanTask(command.id)
        return {
          type: 'text',
          value: `Archived Kanban task ${task.id}: ${task.title}`,
        }
      }
      case 'conflicts':
        return { type: 'text', value: await renderConflicts() }
      case 'files':
        return { type: 'text', value: await renderFiles() }
      case 'export': {
        const { path } = await exportKanbanMarkdown()
        return {
          type: 'text',
          value: `Exported Kanban board to ${path}`,
        }
      }
      case 'open': {
        const rootDir = getProjectRoot()
        const url = await openKanbanDashboard(undefined, rootDir)
        return {
          type: 'text',
          value: `Kanban dashboard opened at ${url}`,
        }
      }
      // Phase 3
      case 'retry': {
        const { task } = await retryKanbanTask(command.id)
        return {
          type: 'text',
          value: `Retried Kanban task ${task.id} (attempt ${task.retry?.attempt ?? 0})`,
        }
      }
      case 'fail': {
        const { task } = await failKanbanTask(command.id, command.reason)
        return {
          type: 'text',
          value: `Failed Kanban task ${task.id}: ${command.reason}`,
        }
      }
      case 'verify': {
        const { task } = await verifyKanbanTask(command.id, command.passed, command.summary)
        return {
          type: 'text',
          value: `Verification ${command.passed ? 'passed' : 'failed'} for task ${task.id}`,
        }
      }
      case 'evidence': {
        const { task } = await addEvidenceToTask(command.id, command.evidenceType as any, command.label, undefined, { content: command.content })
        return {
          type: 'text',
          value: `Added ${command.evidenceType} evidence to task ${task.id}: ${command.label}`,
        }
      }
      case 'events': {
        return { type: 'text', value: await renderEvents(command.id) }
      }
      case 'workspace': {
        if (command.action === 'list') {
          const workspaces = await listWorkspaces()
          if (workspaces.length === 0) return { type: 'text', value: 'No workspaces.' }
          return { type: 'text', value: workspaces.map(w => `- ${w.id}: ${w.name} (${w.rootDir})`).join('\n') }
        }
        return { type: 'text', value: 'Workspace switching not implemented in CLI. Use the dashboard.' }
      }
      case 'project': {
        if (command.action === 'list') {
          const projects = await listProjects()
          if (projects.length === 0) return { type: 'text', value: 'No projects.' }
          return { type: 'text', value: projects.map(p => `- ${p.id}: ${p.name} (workspace: ${p.workspaceId})`).join('\n') }
        }
        return { type: 'text', value: 'Project switching not implemented in CLI. Use the dashboard.' }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { type: 'text', value: `Kanban error: ${message}\n\n${HELP}` }
  }
}
