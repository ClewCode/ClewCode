import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  initKanbanBoard,
  addKanbanTask,
  getKanbanPaths,
  readKanbanBoard,
} from './store.js'
import { startKanbanServer } from './server.js'

const tempDirs: string[] = []

async function makeTempWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-kanban-server-test-'))
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

describe('Kanban Server', () => {
  test('starts server on 127.0.0.1 only', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    close()
  })

  test('returns 404 for board when no board exists', async () => {
    const cwd = await makeTempWorkspace()

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/board`)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('No Kanban board found')

    close()
  })

  test('serves dashboard HTML on root path', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)
    
    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')

    const html = await res.text()
    expect(html).toContain('Kanban Dashboard')
    expect(html).toContain('triage')
    expect(html).toContain('todo')

    close()
  })

  test('GET /api/board returns board data', async () => {
    const cwd = await makeTempWorkspace()
    await addKanbanTask({ title: 'Test Task' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/board`)
    expect(res.status).toBe(200)
    const board = await res.json()
    expect(board.version).toBe(1)
    expect(board.tasks).toHaveLength(1)
    expect(board.tasks[0].title).toBe('Test Task')

    close()
  })

  test('POST /api/tasks creates a new task', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Task', priority: 'high' }),
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.task.title).toBe('New Task')
    expect(data.task.priority).toBe('high')

    const board = await readKanbanBoard(cwd)
    expect(board.tasks).toHaveLength(1)

    close()
  })

  test('POST /api/tasks validates required title', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'High' }),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Title is required')

    close()
  })

  test('DELETE /api/tasks/:id removes a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'To Delete' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}`, {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)

    const board = await readKanbanBoard(cwd)
    expect(board.tasks).toHaveLength(0)

    close()
  })

  test('PATCH /api/tasks/:id updates a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Original' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated', priority: 'urgent' }),
    })
    expect(res.status).toBe(200)

    const board = await readKanbanBoard(cwd)
    expect(board.tasks[0].title).toBe('Updated')
    expect(board.tasks[0].priority).toBe('urgent')

    close()
  })

  test('POST /api/tasks/:id/block blocks a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Block Me' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Waiting for review' }),
    })
    expect(res.status).toBe(200)

    const board = await readKanbanBoard(cwd)
    expect(board.tasks[0].status).toBe('blocked')
    expect(board.tasks[0].blockers).toContain('Waiting for review')

    close()
  })

  test('POST /api/tasks/:id/unblock unblocks a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Unblock Me' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    await fetch(`${url}/api/tasks/${task.id}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Delayed' }),
    })

    const res = await fetch(`${url}/api/tasks/${task.id}/unblock`, {
      method: 'POST',
    })
    expect(res.status).toBe(200)

    const board = await readKanbanBoard(cwd)
    expect(board.tasks[0].status).toBe('todo')
    expect(board.tasks[0].blockers).toEqual([])

    close()
  })

  test('GET /api/files returns declared files', async () => {
    const cwd = await makeTempWorkspace()
    await addKanbanTask({ title: 'Files Task', files: ['src/a.ts', 'src/b.ts'] }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/files`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.files).toHaveLength(2)
    expect(data.files[0].file).toBe('src/a.ts')

    close()
  })

  test('GET /api/conflicts returns file conflicts', async () => {
    const cwd = await makeTempWorkspace()
    const now = '2026-05-08T00:00:00.000Z'
    const { writeKanbanBoard } = await import('./store.js')
      await writeKanbanBoard({
        version: 1,
        tasks: [
          {
            id: 'kb-test-aaa111',
            title: 'First',
            status: 'In Progress',
            owner: 'ai-orchestrator',
            assignedAgent: 'worker-1',
            priority: 'Medium',
            risk: 'Medium',
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
            status: 'In Progress',
            owner: 'ai-orchestrator',
            assignedAgent: 'worker-2',
            priority: 'Medium',
            risk: 'Medium',
            scope: [],
            files: ['src/shared.ts'],
            validation: [],
            notes: '',
            createdAt: now,
            updatedAt: now,
          },
        ],
      }, cwd)

      const { url, close } = await startKanbanServer({ rootDir: cwd })

      const res = await fetch(`${url}/api/conflicts`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.conflicts).toHaveLength(1)
      expect(data.conflicts[0].file).toBe('src/shared.ts')

      close()
  })

  test('POST /api/tasks/:id/move moves a task', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Move Me' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'running', assignedAgent: 'worker-1' }),
    })
    expect(res.status).toBe(200)

    const board = await readKanbanBoard(cwd)
    expect(board.tasks[0].status).toBe('running')
    expect(board.tasks[0].assignedAgent).toBe('worker-1')

    close()
  })

  test('POST /api/export exports markdown', async () => {
    const cwd = await makeTempWorkspace()
    await addKanbanTask({ title: 'Export Test' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/export`, { method: 'POST' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.path).toContain('kanban.md')

    close()
  })

  test('returns 404 for unknown routes', async () => {
    const cwd = await makeTempWorkspace()
    await initKanbanBoard(cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/unknown`)
    expect(res.status).toBe(404)

    close()
  })

  test('validates move status is required', async () => {
    const cwd = await makeTempWorkspace()
    const { task } = await addKanbanTask({ title: 'Task' }, cwd)

    const { url, close } = await startKanbanServer({ rootDir: cwd })

    const res = await fetch(`${url}/api/tasks/${task.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Status is required')

    close()
  })
})