import {
  KANBAN_COLUMNS,
  type KanbanBoard,
  type KanbanTask,
  type KanbanStatus,
} from './types.js'

const STATUS_LABELS: Record<KanbanStatus, string> = {
  triage: 'Triage',
  todo: 'Todo',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  archived: 'Archived',
}

function statusLabel(status: KanbanStatus): string {
  return STATUS_LABELS[status] ?? status
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.map(escapeCell).join('<br>') : '-'
}

function taskRow(task: KanbanTask): string {
  const meta = task.metadata ?? {}
  const scope = Array.isArray(task.scope) ? task.scope : (meta.scope as string[] ?? [])
  const files = Array.isArray(task.files) ? task.files : (meta.files as string[] ?? [])
  const validation = Array.isArray(task.validation) ? task.validation : (meta.validation as string[] ?? [])
  const notes = task.notes ?? (meta.notes as string) ?? ''
  const risk = task.risk ?? (meta.risk as string) ?? ''
  const assignedAgent = task.assignedAgent ?? (meta.assignedAgent as string) ?? ''
  const blockers = Array.isArray(task.comments) ? task.comments.filter(c => c.author === 'system' && c.body.startsWith('Blocked:')).map(c => c.body.replace('Blocked: ', '')) : []

  return [
    task.id,
    task.title,
    task.priority ?? 'normal',
    risk || '-',
    task.owner || '-',
    assignedAgent || '-',
    formatList(scope),
    formatList(files),
    formatList(validation),
    formatList(blockers),
    notes || '-',
    task.updatedAt,
  ]
    .map(escapeCell)
    .join(' | ')
}

export function renderKanbanMarkdown(
  board: KanbanBoard,
  generatedAt = new Date().toISOString(),
): string {
  const lines = [
    '# Agent Kanban',
    '',
    `Generated: ${generatedAt}`,
    '',
    '| Status | Count |',
    '| --- | ---: |',
  ]

  for (const status of KANBAN_COLUMNS) {
    lines.push(
      `| ${statusLabel(status)} | ${board.tasks.filter(task => task.status === status).length} |`,
    )
  }

  for (const status of KANBAN_COLUMNS) {
    lines.push(
      '',
      `## ${statusLabel(status)}`,
      '',
      '| ID | Title | Priority | Risk | Owner | Agent | Scope | Files | Validation | Blockers | Notes | Updated |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    )
    const tasks = board.tasks.filter(task => task.status === status)
    if (tasks.length === 0) {
      lines.push('| - | - | - | - | - | - | - | - | - | - | - | - |')
    } else {
      for (const task of tasks) {
        lines.push(`| ${taskRow(task)} |`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}
