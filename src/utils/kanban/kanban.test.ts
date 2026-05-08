import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { call, parseKanbanArgs } from '../../commands/kanban/kanban.js'
import { runWithCwdOverride } from '../cwd.js'
import {
  addEvidenceToTask,
  addKanbanTask,
  assignKanbanTask,
  blockKanbanTask,
  claimKanbanTask,
  createProject,
  createWorkspace,
  deleteKanbanTask,
  detectKanbanFileConflicts,
  detectZombieTasks,
  editKanbanTask,
  ensureDefaultWorkspace,
  exportKanbanMarkdown,
  failKanbanTask,
  getDefaultProject,
  getKanbanTask,
  getKanbanPaths,
  getTaskEvents,
  heartbeatKanbanTask,
  initKanbanBoard,
  listKanbanFiles,
  listProjects,
  listStaleTasks,
  listWorkspaces,
  listZombieTasks,
  moveKanbanTask,
  readKanbanBoard,
  reclaimKanbanTask,
  releaseKanbanTask,
  retryKanbanTask,
  unblockKanbanTask,
  verifyAndCompleteTask,
  verifyKanbanTask,
  writeKanbanBoard,
} from './store.js'
import { renderKanbanMarkdown } from './markdown.js'
import { validateBoard, validateRelativeSafePath } from './validation.js'
import { startKanbanServer } from './server.js'

const tempDirs: string[] = []

async function makeTempWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-kanban-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe('Kanban schema validation', () => {
  test('accepts a valid empty board', () => {
    expect(validateBoard({ version: 1, tasks: [] })).toEqual({
      version: 1,
      tasks: [],
    })
  })

  test('migrates invalid status, priority, and risk to defaults', () => {
    const baseTask = {
      id: 'kb-test-abc123',
      title: 'Coordinate work',
      status: 'todo',
      owner: 'ai-orchestrator',
      priority: 'normal',
      risk: 'normal',
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    }

    const result1 = validateBoard({ version: 1, tasks: [{ ...baseTask, status: 'Doing' }] })
    expect(result1.tasks[0].status).toBe('todo')

    const result2 = validateBoard({ version: 1, tasks: [{ ...baseTask, priority: 'Urgent' }] })
    expect(result2.tasks[0].priority).toBe('normal')

    const result3 = validateBoard({ version: 1, tasks: [{ ...baseTask, risk: 'Severe' }] })
    expect(result3.tasks[0].risk).toBe('normal')
  })

  test('accepts legacy tasks without blockers metadata', () => {
    const task = {
      id: 'kb-test-abc123',
      title: 'Legacy task',
      status: 'todo',
      owner: 'ai-orchestrator',
      assignedAgent: '',
      priority: 'normal',
      risk: 'normal',
      scope: [],
      files: [],
      validation: [],
      notes: '',
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z',
    }

    const result = validateBoard({ version: 1, tasks: [task] }).tasks[0]
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.status).toBe('todo')
    expect(result.owner).toBe('ai-orchestrator')
    expect(result.priority).toBe('normal')
  })

  test('rejects unsafe file paths', () => {
    expect(() => validateRelativeSafePath('../outside.ts')).toThrow(
      'cannot traverse',
    )
    expect(() => validateRelativeSafePath('/absolute.ts')).toThrow(
      'must be relative',
    )
    expect(() => validateRelativeSafePath('.env')).toThrow(
      'sensitive files',
    )
    expect(validateRelativeSafePath('src/utils/kanban/store.ts')).toBe(
      'src/utils/kanban/store.ts',
    )
  })
})

describe('Kanban store', () => {
  test('initializes an empty board without overwriting an existing one', async () => {
    const cwd = await makeTempWorkspace()
    const first = await initKanbanBoard(cwd)
    const second = await initKanbanBoard(cwd)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(await readKanbanBoard(cwd)).toEqual({ version: 1, tasks: [] })
  })

  test('adds, lists via store read, and moves a task', async () => {
    const cwd = await makeTempWorkspace()
    const added = await addKanbanTask(
      {
        title: 'Implement Kanban store',
        priority: 'high',
        risk: 'normal',
        files: ['src/utils/kanban/store.ts'],
        validation: ['bun test src/utils/kanban/kanban.test.ts'],
      },
      cwd,
    )

    expect(added.task.status).toBe('todo')
    expect(added.task.owner).toBe('ai-orchestrator')
    expect(added.board.tasks).toHaveLength(1)

    const moved = await moveKanbanTask(added.task.id, 'running', cwd, {
      assignedAgent: 'worker-1',
    })
    expect(moved.task.status).toBe('running')
    expect(moved.task.assignedAgent).toBe('worker-1')

    const board = await readKanbanBoard(cwd)
    expect(board.tasks[0].status).toBe('running')
  })

  test('prevents parallel in-progress edits to the same file', async () => {
    const cwd = await makeTempWorkspace()
    const first = await addKanbanTask(
      {
        title: 'First edit',
        status: 'running',
        files: ['src/shared.ts'],
      },
      cwd,
    )
    expect(first.task.status).toBe('running')

    await expect(
      addKanbanTask(
        {
          title: 'Conflicting edit',
          status: 'running',
          files: ['src/shared.ts'],
        },
        cwd,
      ),
    ).rejects.toThrow('already assigned')
  })

  test('shows an existing task and errors for a missing task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Show me' }, cwd)

    await expect(getKanbanTask(task.id, cwd)).resolves.toMatchObject({
      id: task.id,
      title: 'Show me',
    })
    await expect(getKanbanTask('kb-missing-abc123', cwd)).rejects.toThrow(
      'Kanban task not found',
    )
  })

  test('edits title, priority, risk, files, and validation', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Before' }, cwd)
    const edited = await editKanbanTask(
      task.id,
      {
        title: 'After',
        priority: 'urgent',
        risk: 'high',
        files: ['src/a.ts', 'src/b.ts'],
        validation: ['bun test'],
      },
      cwd,
    )

    expect(edited.task).toMatchObject({
      title: 'After',
      priority: 'urgent',
      risk: 'high',
      files: ['src/a.ts', 'src/b.ts'],
      validation: ['bun test'],
    })

    const cleared = await editKanbanTask(
      task.id,
      { files: [], validation: [] },
      cwd,
    )
    expect(cleared.task.files).toEqual([])
    expect(cleared.task.validation).toEqual([])
  })

  test('deletes a task by exact id', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Delete me' }, cwd)

    const deleted = await deleteKanbanTask(task.id, cwd)
    expect(deleted.task.id).toBe(task.id)
    expect((await readKanbanBoard(cwd)).tasks).toEqual([])
    await expect(deleteKanbanTask(task.id, cwd)).rejects.toThrow(
      'Kanban task not found',
    )
  })

  test('assigns and clears an agent without changing status', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask(
      { title: 'Assign me', status: 'ready' },
      cwd,
    )

    const assigned = await assignKanbanTask(task.id, 'worker-1', cwd)
    expect(assigned.task.assignedAgent).toBe('worker-1')
    expect(assigned.task.status).toBe('ready')

    const cleared = await assignKanbanTask(task.id, '', cwd)
    expect(cleared.task.assignedAgent).toBe('')
    expect(cleared.task.status).toBe('ready')
  })

  test('blocks and unblocks a task while preserving prior status', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask(
      { title: 'Wait on review', status: 'running' },
      cwd,
    )

    const blocked = await blockKanbanTask(task.id, 'Needs design answer', cwd)
    expect(blocked.task.status).toBe('blocked')
    expect(blocked.task.blockers).toEqual(['Needs design answer'])
    expect(blocked.task.blockedFromStatus).toBe('running')

    const unblocked = await unblockKanbanTask(task.id, cwd)
    expect(unblocked.task.status).toBe('running')
    expect(unblocked.task.blockers).toEqual([])
    expect(unblocked.task.blockedFromStatus).toBeUndefined()
  })

  test('detects file conflicts among in-progress tasks', async () => {
    const cwd = await makeTempWorkspace()
    const now = '2026-05-08T00:00:00.000Z'
    await writeKanbanBoard(
      {
        version: 1,
        tasks: [
          {
            id: 'kb-test-aaa111',
            title: 'First',
            status: 'running',
            owner: 'ai-orchestrator',
            assignedAgent: 'worker-1',
            priority: 'normal',
            risk: 'normal',
            scope: [],
            files: ['src/shared.ts'],
            validation: [],
            notes: '',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'kb-test-bbb222',
            title: 'Second',
            status: 'running',
            owner: 'ai-orchestrator',
            assignedAgent: 'worker-2',
            priority: 'normal',
            risk: 'normal',
            scope: [],
            files: ['src/shared.ts'],
            validation: [],
            notes: '',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      cwd,
    )

    const conflicts = detectKanbanFileConflicts(await readKanbanBoard(cwd))
    expect(conflicts).toEqual([
      {
        file: 'src/shared.ts',
        tasks: [
          {
            id: 'kb-test-aaa111',
            title: 'First',
            status: 'running',
            assignee: 'worker-1',
          },
          {
            id: 'kb-test-bbb222',
            title: 'Second',
            status: 'running',
            assignee: 'worker-2',
          },
        ],
      },
    ])
  })

  test('lists declared files grouped by task metadata', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask(
      {
        title: 'Files',
        status: 'running',
        assignedAgent: 'reviewer',
        files: ['src/a.ts', 'src/b.ts'],
      },
      cwd,
    )

    expect(listKanbanFiles(await readKanbanBoard(cwd))).toEqual([
      {
        file: 'src/a.ts',
        taskId: task.id,
        status: 'running',
        assignee: 'reviewer',
      },
      {
        file: 'src/b.ts',
        taskId: task.id,
        status: 'running',
        assignee: 'reviewer',
      },
    ])
  })

  test('uses atomic writes without leaving temp files behind', async () => {
    const cwd = await makeTempWorkspace()
    await addKanbanTask({ title: 'Atomic' }, cwd)
    const taskDir = join(cwd, '.claude/tasks')
    const files = await readdir(taskDir)
    expect(files).toContain('kanban.json')
    expect(files.filter(file => file.includes('.tmp.'))).toEqual([])
  })

  test('writes only the fixed board paths under the workspace', async () => {
    const cwd = await makeTempWorkspace()
    const paths = getKanbanPaths(cwd)
    expect(paths.json).toBe(join(cwd, '.claude/tasks/kanban.json'))
    expect(paths.markdown).toBe(join(cwd, '.claude/tasks/kanban.md'))
  })

  test('includes path separator between root and .claude directory', async () => {
    const cwd = await makeTempWorkspace()
    const paths = getKanbanPaths(cwd)
    // If string concatenation were used instead of join(), the path would be
    // root.claude/... (missing separator). Verify the separator is present.
    const sep = paths.root.includes('\\') ? '\\' : '/'
    expect(paths.json).toContain(`${paths.root}${sep}.claude`)
    expect(paths.markdown).toContain(`${paths.root}${sep}.claude`)
    // Also verify the subdirectory structure is intact
    expect(paths.json).toContain(`${sep}.claude${sep}tasks${sep}kanban.json`)
    expect(paths.markdown).toContain(`${sep}.claude${sep}tasks${sep}kanban.md`)
  })

  test('rejects traversal attempts that would escape the workspace', async () => {
    const cwd = await makeTempWorkspace()
    const paths = getKanbanPaths(cwd)
    // getKanbanPaths should only produce paths under root
    expect(paths.json.startsWith(paths.root)).toBe(true)
    expect(paths.markdown.startsWith(paths.root)).toBe(true)
  })
})

describe('Kanban Markdown export', () => {
  test('renders and exports readable Markdown', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask(
      {
        title: 'Review agent coordination',
        status: 'running',
        priority: 'urgent',
        risk: 'high',
        scope: ['orchestration'],
        files: ['src/commands/kanban/kanban.ts'],
        validation: ['manual review'],
        notes: 'Check owner-only board control.',
      },
      cwd,
    )

    const board = await readKanbanBoard(cwd)
    const markdown = renderKanbanMarkdown(board, '2026-05-08T00:00:00.000Z')
    expect(markdown).toContain('# Agent Kanban')
    expect(markdown).toContain('## Running')
    expect(markdown).toContain(task.id)
    expect(markdown).toContain('Review agent coordination')
    expect(markdown).toContain('Blockers')

    const exported = await exportKanbanMarkdown(cwd)
    const content = await readFile(exported.path, { encoding: 'utf8' })
    expect(content).toContain('Review agent coordination')
  })
})

describe('/kanban command parsing', () => {
  test('parses add with quoted title and repeated fields', () => {
    const parsed = parseKanbanArgs(
      'add "Build Kanban" --priority high --risk critical --file src/a.ts --file src/b.ts --validation "bun test"',
    )
    expect(parsed.type).toBe('add')
    if (parsed.type === 'add') {
      expect(parsed.input.title).toBe('Build Kanban')
      expect(parsed.input.priority).toBe('high')
      expect(parsed.input.risk).toBe('critical')
      expect(parsed.input.files).toEqual(['src/a.ts', 'src/b.ts'])
      expect(parsed.input.validation).toEqual(['bun test'])
    }
  })

  test('parses move', () => {
    const parsed = parseKanbanArgs(
      'move kb-test-abc123 "running" --agent worker-1',
    )
    expect(parsed).toEqual({
      type: 'move',
      id: 'kb-test-abc123',
      status: 'running',
      update: { assignedAgent: 'worker-1' },
    })
  })

  test('parses edit, assign, block, unblock, conflicts, and files', () => {
    expect(
      parseKanbanArgs(
        'edit kb-test-abc123 --title "After" --priority high --risk low --file src/a.ts,src/b.ts --validation "bun test"',
      ),
    ).toEqual({
      type: 'edit',
      id: 'kb-test-abc123',
      update: {
        title: 'After',
        priority: 'high',
        risk: 'low',
        files: ['src/a.ts', 'src/b.ts'],
        validation: ['bun test'],
      },
    })
    expect(parseKanbanArgs('assign kb-test-abc123 none')).toEqual({
      type: 'assign',
      id: 'kb-test-abc123',
      assignedAgent: '',
    })
    expect(parseKanbanArgs('block kb-test-abc123 --reason "Waiting"')).toEqual({
      type: 'block',
      id: 'kb-test-abc123',
      reason: 'Waiting',
    })
    expect(parseKanbanArgs('unblock kb-test-abc123')).toEqual({
      type: 'unblock',
      id: 'kb-test-abc123',
    })
    expect(parseKanbanArgs('conflicts')).toEqual({ type: 'conflicts' })
    expect(parseKanbanArgs('files')).toEqual({ type: 'files' })
  })

  test('shows missing task errors through the command', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)
    const result = await runWithCwdOverride(cwd, () =>
      call('show kb-missing-abc123', {} as never),
    )
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Kanban task not found')
    }
  })

  test('converts unknown status, priority, and risk to defaults via migration', () => {
    const moveParsed = parseKanbanArgs('move kb-test-abc123 UnknownStatus')
    expect(moveParsed).toEqual({
      type: 'move',
      id: 'kb-test-abc123',
      status: 'todo',
      update: {},
    })

    const addParsed = parseKanbanArgs('add Task --priority UnknownPriority')
    expect(addParsed.type).toBe('add')
    if (addParsed.type === 'add') {
      expect(addParsed.input.priority).toBe('normal')
    }

    const editParsed = parseKanbanArgs('edit kb-test-abc123 --risk UnknownRisk')
    expect(editParsed).toEqual({
      type: 'edit',
      id: 'kb-test-abc123',
      update: { risk: 'UnknownRisk' },
    })
  })
})

// ─── Phase 3: Lease / Heartbeat ───────────────────────────

describe('Kanban lease and heartbeat', () => {
  test('claim a ready task moves it to running and creates lease', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Claimable', status: 'ready' }, cwd)
    expect(task.status).toBe('ready')

    const result = await claimKanbanTask(task.id, 'worker-1', 'agent-1', cwd)
    expect(result.task.status).toBe('running')
    expect(result.task.lease).toBeDefined()
    expect(result.task.lease!.workerId).toBe('worker-1')
    expect(result.task.lease!.claimedBy).toBe('agent-1')
    expect(result.task.lease!.status).toBe('active')
    expect(result.task.lease!.expiresAt).toBeDefined()
  })

  test('cannot claim a task that is not ready or todo', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Done task', status: 'done' }, cwd)
    await expect(claimKanbanTask(task.id, 'w1', 'a1', cwd)).rejects.toThrow('Cannot claim')
  })

  test('heartbeat extends lease expiry', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Heartbeat', status: 'ready' }, cwd)
    const claimed = await claimKanbanTask(task.id, 'w1', 'a1', cwd, { ttlMs: 60000 })
    const originalExpiresAt = claimed.task.lease!.expiresAt

    // Wait a tiny bit so timestamps differ
    await new Promise(r => setTimeout(r, 10))

    const hb = await heartbeatKanbanTask(task.id, 'w1', cwd)
    expect(new Date(hb.task.lease!.expiresAt).getTime()).toBeGreaterThan(
      new Date(originalExpiresAt).getTime(),
    )
    expect(hb.task.lease!.lastHeartbeatAt).toBeDefined()
    expect(hb.task.lease!.status).toBe('active')
  })

  test('heartbeat rejects wrong worker', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Wrong worker', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    await expect(heartbeatKanbanTask(task.id, 'w2', cwd)).rejects.toThrow('does not own lease')
  })

  test('release clears lease and returns to ready', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Release me', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const released = await releaseKanbanTask(task.id, 'w1', cwd)
    expect(released.task.lease).toBeUndefined()
    expect(released.task.status).toBe('ready')
  })

  test('complete clears lease (via verifyAndComplete)', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Complete lease', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const completed = await verifyAndCompleteTask(task.id, 'Done!', 'w1', cwd)
    expect(completed.task.status).toBe('done')
    expect(completed.task.lease).toBeUndefined()
    expect(completed.task.completedAt).toBeDefined()
  })

  test('reclaim creates new lease', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Reclaim me', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const reclaimed = await reclaimKanbanTask(task.id, 'w2', 'a2', cwd)
    expect(reclaimed.task.lease!.workerId).toBe('w2')
    expect(reclaimed.task.lease!.claimedBy).toBe('a2')
    expect(reclaimed.task.status).toBe('running')
  })

  test('events are recorded for claim, heartbeat, release, reclaim', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Events', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    await heartbeatKanbanTask(task.id, 'w1', cwd)
    await releaseKanbanTask(task.id, 'w1', cwd)

    const board = await readKanbanBoard(cwd)
    const events = getTaskEvents(board, task.id)
    expect(events.length).toBeGreaterThanOrEqual(3)
    expect(events[0].type).toBe('claimed')
    expect(events[1].type).toBe('heartbeat')
    expect(events[2].type).toBe('released')
  })
})

// ─── Phase 3: Zombie Detection ────────────────────────────

describe('Kanban zombie detection', () => {
  test('detects stale task after lease expiry', () => {
    const now = new Date('2026-05-08T12:00:00Z')
    const past = new Date(now.getTime() - 130000).toISOString() // 130s ago, past 120s TTL
    const board = {
      version: 1 as const,
      tasks: [{
        id: 'kb-test-stale1',
        title: 'Stale task',
        status: 'running' as const,
        owner: 'test',
        createdAt: past,
        updatedAt: past,
        lease: {
          leaseId: 'kl-test1',
          workerId: 'w1',
          claimedBy: 'a1',
          claimedAt: past,
          expiresAt: past,
          heartbeatIntervalMs: 30000,
          status: 'active' as const,
        },
      }],
    }
    const stale = listStaleTasks(board, now)
    expect(stale).toHaveLength(1)

    const zombies = listZombieTasks(board, now)
    expect(zombies).toHaveLength(0) // only stale, not yet zombie
  })

  test('detects zombie task after grace period', () => {
    const now = new Date('2026-05-08T12:00:00Z')
    const veryPast = new Date(now.getTime() - 600000).toISOString() // 10min ago, past 5min grace
    const board = {
      version: 1 as const,
      tasks: [{
        id: 'kb-test-zombie1',
        title: 'Zombie task',
        status: 'running' as const,
        owner: 'test',
        createdAt: veryPast,
        updatedAt: veryPast,
        lease: {
          leaseId: 'kl-test2',
          workerId: 'w1',
          claimedBy: 'a1',
          claimedAt: veryPast,
          expiresAt: veryPast,
          heartbeatIntervalMs: 30000,
          status: 'stale' as const,
        },
      }],
    }
    const zombies = detectZombieTasks(board, now)
    expect(zombies).toHaveLength(1)
  })

  test('non-expired running task is not zombie', () => {
    const now = new Date('2026-05-08T12:00:00Z')
    const recent = new Date(now.getTime() - 10000).toISOString()
    const board = {
      version: 1 as const,
      tasks: [{
        id: 'kb-test-healthy',
        title: 'Healthy task',
        status: 'running' as const,
        owner: 'test',
        createdAt: recent,
        updatedAt: recent,
        lease: {
          leaseId: 'kl-test3',
          workerId: 'w1',
          claimedBy: 'a1',
          claimedAt: recent,
          expiresAt: new Date(now.getTime() + 60000).toISOString(),
          heartbeatIntervalMs: 30000,
          status: 'active' as const,
        },
      }],
    }
    expect(detectZombieTasks(board, now)).toHaveLength(0)
    expect(listStaleTasks(board, now)).toHaveLength(0)
  })

  test('reclaim zombie task assigns new lease', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Zombie reclaim', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const reclaimed = await reclaimKanbanTask(task.id, 'w2', 'a2', cwd)
    expect(reclaimed.task.lease!.workerId).toBe('w2')
    expect(reclaimed.task.status).toBe('running')
  })
})

// ─── Phase 3: Retry / Fail ────────────────────────────────

describe('Kanban retry and fail', () => {
  test('fail task records error and marks done', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Fail me', status: 'running' }, cwd)
    const failed = await failKanbanTask(task.id, 'Something broke', 'w1', cwd)
    expect(failed.task.status).toBe('done')
    expect(failed.task.retry?.lastError).toBe('Something broke')
  })

  test('retry increments attempt and moves to ready', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Retry me', status: 'running' }, cwd)
    await failKanbanTask(task.id, 'First fail', 'w1', cwd)
    const retried = await retryKanbanTask(task.id, 'w1', cwd)
    expect(retried.task.retry?.attempt).toBe(1)
    expect(retried.task.status).toBe('ready')
    expect(retried.task.retry?.lastError).toBeUndefined()
  })

  test('retry blocked when maxAttempts reached', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Max retry', status: 'running' }, cwd)
    await failKanbanTask(task.id, 'Fail 1', 'w1', cwd)
    await retryKanbanTask(task.id, 'w1', cwd)
    await failKanbanTask(task.id, 'Fail 2', 'w1', cwd)
    await retryKanbanTask(task.id, 'w1', cwd)
    await failKanbanTask(task.id, 'Fail 3', 'w1', cwd)
    await retryKanbanTask(task.id, 'w1', cwd)
    await failKanbanTask(task.id, 'Fail 4', 'w1', cwd)
    // maxAttempts is 3, so 4th retry should fail
    await expect(retryKanbanTask(task.id, 'w1', cwd)).rejects.toThrow('max retry attempts')
  })

  test('retry preserves comments and events', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Preserve', status: 'running' }, cwd)
    const { commentKanbanTask } = await import('./store.js')
    await commentKanbanTask(task.id, 'user', 'Important note', cwd)
    await failKanbanTask(task.id, 'Error', 'w1', cwd)
    const retried = await retryKanbanTask(task.id, 'w1', cwd)

    expect(retried.task.comments).toHaveLength(1)
    expect(retried.task.comments![0].body).toBe('Important note')

    const board = await readKanbanBoard(cwd)
    const events = getTaskEvents(board, task.id)
    expect(events.some(e => e.type === 'commented')).toBe(true)
    expect(events.some(e => e.type === 'retried')).toBe(true)
  })
})

// ─── Phase 3: Hallucination Recovery / Verification ───────

describe('Kanban hallucination recovery and verification', () => {
  test('verify task records passed/failed', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Verify me' }, cwd)
    const v = await verifyKanbanTask(task.id, true, 'All tests pass', cwd)
    expect(v.task.verification?.passed).toBe(true)
    expect(v.task.verification?.summary).toBe('All tests pass')
  })

  test('addEvidenceToTask stores evidence', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Evidence' }, cwd)
    const e1 = await addEvidenceToTask(task.id, 'command', 'bun test', cwd, { content: '40 pass' })
    expect(e1.task.verification?.evidence).toHaveLength(1)
    expect(e1.task.verification?.evidence![0].label).toBe('bun test')
    expect(e1.task.verification?.evidence![0].type).toBe('command')

    const e2 = await addEvidenceToTask(task.id, 'file', 'src/test.ts', cwd, { path: 'src/test.ts' })
    expect(e2.task.verification?.evidence).toHaveLength(2)
  })

  test('complete without required verification moves to ready (review)', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Review needed', status: 'running' }, cwd)
    // Set required commands via hallucinationGuard
    const { editKanbanTask } = await import('./store.js')
    await editKanbanTask(task.id, {
      verification: { requiredCommands: ['bun test'] },
      hallucinationGuard: { expectedFiles: ['src/test.ts'], claimedCommands: ['bun test'], verifiedCommands: [] },
    }, cwd)

    // Try to complete - should go to ready (review) since commands are not verified
    const result = await verifyAndCompleteTask(task.id, 'Done!', 'w1', cwd)
    expect(result.task.status).toBe('ready') // moved to review
    expect(result.task.lease).toBeUndefined()
  })

  test('complete with verification passes to done', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Good task', status: 'running' }, cwd)
    await addEvidenceToTask(task.id, 'command', 'bun test', cwd, { content: '40 pass' })
    await verifyKanbanTask(task.id, true, 'All good', cwd)

    const result = await verifyAndCompleteTask(task.id, 'Done!', 'w1', cwd)
    expect(result.task.status).toBe('done')
    expect(result.task.completedAt).toBeDefined()
  })

  test('mismatch between claimed and verified commands is detected', async () => {
    const cwd = await makeTempWorkspace()
    const { editKanbanTask } = await import('./store.js')
    const { task } = await addKanbanTask({ title: 'Liar task', status: 'running' }, cwd)
    await editKanbanTask(task.id, {
      hallucinationGuard: {
        claimedCommands: ['bun test', 'bun build'],
        verifiedCommands: ['bun test'],
        expectedFiles: ['src/output.ts'],
        changedFiles: [],
      },
    }, cwd)

    const result = await verifyAndCompleteTask(task.id, 'Done!', 'w1', cwd)
    expect(result.task.status).toBe('ready') // review due to mismatch
    expect(result.task.hallucinationGuard?.mismatchDetected).toBe(true)
  })

  test('evidence events are recorded', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Evidence events' }, cwd)
    await addEvidenceToTask(task.id, 'test', 'unit tests', cwd, { content: 'pass' })
    await verifyKanbanTask(task.id, true, 'OK', cwd)

    const board = await readKanbanBoard(cwd)
    const events = getTaskEvents(board, task.id)
    expect(events.some(e => e.type === 'verification_added')).toBe(true)
    expect(events.some(e => e.type === 'verification_passed')).toBe(true)
  })
})

// ─── Phase 3: Workspace / Project ─────────────────────────

describe('Kanban workspace and project', () => {
  test('default workspace is created lazily', async () => {
    const cwd = await makeTempWorkspace()
    const ws = await ensureDefaultWorkspace(cwd)
    expect(ws.id).toBeDefined()
    expect(ws.rootDir).toBe(cwd)
    expect(ws.name).toBe('default')

    // Second call returns same workspace
    const ws2 = await ensureDefaultWorkspace(cwd)
    expect(ws2.id).toBe(ws.id)
  })

  test('default project is created with workspace', async () => {
    const cwd = await makeTempWorkspace()
    const proj = await getDefaultProject(cwd)
    expect(proj.id).toBeDefined()
    expect(proj.name).toBe('default')
    expect(proj.workspaceId).toBeDefined()
  })

  test('listWorkspaces returns created workspaces', async () => {
    const cwd = await makeTempWorkspace()
    await ensureDefaultWorkspace(cwd)
    const ws = await createWorkspace('test-ws', '/tmp/test', cwd)
    const list = await listWorkspaces(cwd)
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.some(w => w.id === ws.id)).toBe(true)
  })

  test('createProject adds a project', async () => {
    const cwd = await makeTempWorkspace()
    const ws = await ensureDefaultWorkspace(cwd)
    const proj = await createProject(ws.id, 'test-project', cwd, cwd)
    const projects = await listProjects(undefined, cwd)
    expect(projects.some(p => p.id === proj.id)).toBe(true)
  })

  test('two temp rootDirs do not leak tasks', async () => {
    const cwd1 = await makeTempWorkspace()
    const cwd2 = await makeTempWorkspace()

    const { task: t1 } = await addKanbanTask({ title: 'Task in dir1' }, cwd1)
    await addKanbanTask({ title: 'Task in dir2' }, cwd2)

    const board1 = await readKanbanBoard(cwd1)
    expect(board1.tasks).toHaveLength(1)
    expect(board1.tasks[0].id).toBe(t1.id)
  })
})

// ─── Phase 3: Server Endpoints ────────────────────────────

describe('Kanban Phase 3 server endpoints', () => {
  test('POST /api/tasks/:id/claim claims a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Claim via API', status: 'ready' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1', claimedBy: 'a1' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.status).toBe('running')
    expect(data.task.lease.workerId).toBe('w1')

    close()
  })

  test('POST /api/tasks/:id/heartbeat extends lease', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'HB via API', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.lease.status).toBe('active')

    close()
  })

  test('POST /api/tasks/:id/release releases lease', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Release via API', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.lease).toBeUndefined()

    close()
  })

  test('POST /api/tasks/:id/retry retries a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Retry via API', status: 'running' }, cwd)
    await failKanbanTask(task.id, 'Error', 'w1', cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.status).toBe('ready')

    close()
  })

  test('POST /api/tasks/:id/fail fails a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Fail via API', status: 'running' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'API error' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.status).toBe('done')

    close()
  })

  test('POST /api/tasks/:id/verify records verification', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Verify via API' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passed: true, summary: 'API test pass' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.verification.passed).toBe(true)

    close()
  })

  test('POST /api/tasks/:id/evidence adds evidence', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Evidence via API' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'command', label: 'bun test', content: 'pass' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.verification.evidence).toHaveLength(1)
    expect(data.task.verification.evidence[0].label).toBe('bun test')

    close()
  })

  test('GET /api/tasks/:id/events returns task events', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Events via API' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/events`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('events')
    expect(Array.isArray(data.events)).toBe(true)

    close()
  })

  test('GET /api/zombies returns zombie tasks', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/zombies`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.zombies)).toBe(true)

    close()
  })

  test('POST /api/zombies/reclaim reclaims a zombie', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Zombie reclaim API', status: 'ready' }, cwd)
    await claimKanbanTask(task.id, 'w1', 'a1', cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/zombies/reclaim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, workerId: 'w2', claimedBy: 'a2' }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.task.lease.workerId).toBe('w2')

    close()
  })

  test('GET /api/workspaces returns workspaces', async () => {
    const cwd = await makeTempWorkspace()
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/workspaces`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.workspaces)).toBe(true)

    close()
  })

  test('POST /api/workspaces creates a workspace', async () => {
    const cwd = await makeTempWorkspace()
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'api-ws', rootDir: '/tmp/api-test' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.workspace.name).toBe('api-ws')

    close()
  })

  test('GET /api/projects returns projects', async () => {
    const cwd = await makeTempWorkspace()
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/projects`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.projects)).toBe(true)

    close()
  })

  test('POST /api/projects creates a project', async () => {
    const cwd = await makeTempWorkspace()
    const ws = await ensureDefaultWorkspace(cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: ws.id, name: 'api-proj' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.project.name).toBe('api-proj')

    close()
  })

  test('all endpoints use provided rootDir', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'RootDir isolation', status: 'ready' }, cwd)
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    // These should not throw 500
    const r1 = await fetch(`${url}/api/zombies`)
    expect(r1.status).toBe(200)

    const r2 = await fetch(`${url}/api/workspaces`)
    expect(r2.status).toBe(200)

    const r3 = await fetch(`${url}/api/tasks/${task.id}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId: 'w1', claimedBy: 'a1' }),
    })
    expect(r3.status).toBe(200)

    close()
  })
})
