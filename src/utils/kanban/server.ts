import { createServer } from 'http'
import open from 'open'
import {
  addKanbanTask,
  addEvidenceToTask,
  archiveKanbanTask,
  blockKanbanTask,
  claimKanbanTask,
  commentKanbanTask,
  completeKanbanTask,
  createProject,
  createWorkspace,
  deleteKanbanTask,
  detectKanbanFileConflicts,
  editKanbanTask,
  ensureDefaultWorkspace,
  exportKanbanMarkdown,
  failKanbanTask,
  getDefaultProject,
  getProjectBoardPath,
  getTaskEvents,
  heartbeatKanbanTask,
  kanbanBoardExists,
  listKanbanFiles,
  listKanbanTasks,
  listProjects,
  listWorkspaces,
  moveKanbanTask,
  readKanbanBoard,
  reclaimKanbanTask,
  releaseKanbanTask,
  retryKanbanTask,
  unblockKanbanTask,
  verifyAndCompleteTask,
  verifyKanbanTask,
} from './store.js'
import { detectZombieTasks, listZombieTasks, listStaleTasks } from './store.js'
import type { KanbanTaskInput, KanbanTaskUpdate } from './types.js'

type ApiResponse = {
  status: number
  body: unknown
}

type ServerOptions = {
  port?: number
  rootDir?: string
}

function parseJsonBody(body: string | null): unknown {
  if (!body) return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function createJsonResponse(status: number, body: unknown): ApiResponse {
  return { status, body }
}

function createServerHandlers(rootDir: string) {
  return {
    async handleBoard(): Promise<ApiResponse> {
      if (!(await kanbanBoardExists(rootDir))) {
        return createJsonResponse(404, { error: 'No Kanban board found' })
      }
      const board = await readKanbanBoard(rootDir)
      return createJsonResponse(200, board)
    },

    async handleAddTask(body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const input = body as KanbanTaskInput
      if (!input.title || typeof input.title !== 'string') {
        return createJsonResponse(400, { error: 'Title is required' })
      }
      try {
        const { task } = await addKanbanTask(input, rootDir)
        return createJsonResponse(201, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handlePatchTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const update = body as KanbanTaskUpdate
      try {
        const { task } = await editKanbanTask(id, update, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleDeleteTask(id: string): Promise<ApiResponse> {
      try {
        const { task } = await deleteKanbanTask(id, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleMoveTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { status, assignedAgent, owner, notes } = body as {
        status: string
        assignedAgent?: string
        owner?: string
        notes?: string
      }
      if (!status) {
        return createJsonResponse(400, { error: 'Status is required' })
      }
      try {
        const updateData: { assignedAgent?: string; owner?: string; notes?: string } = {}
        if (assignedAgent !== undefined) updateData.assignedAgent = assignedAgent
        if (owner !== undefined) updateData.owner = owner
        if (notes !== undefined) updateData.notes = notes

        const { task } = await moveKanbanTask(id, status as any, rootDir, updateData)
        return createJsonResponse(200, { task })
      } catch (error) {
        console.error('DEBUG handleMoveTask error:', error)
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleBlockTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { reason } = body as { reason: string }
      if (!reason) {
        return createJsonResponse(400, { error: 'Reason is required' })
      }
      try {
        const { task } = await blockKanbanTask(id, reason, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleUnblockTask(id: string): Promise<ApiResponse> {
      try {
        const { task } = await unblockKanbanTask(id, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleFiles(): Promise<ApiResponse> {
      if (!(await kanbanBoardExists(rootDir))) {
        return createJsonResponse(404, { error: 'No Kanban board found' })
      }
      const board = await readKanbanBoard(rootDir)
      const files = listKanbanFiles(board)
      return createJsonResponse(200, { files })
    },

    async handleConflicts(): Promise<ApiResponse> {
      if (!(await kanbanBoardExists(rootDir))) {
        return createJsonResponse(404, { error: 'No Kanban board found' })
      }
      const board = await readKanbanBoard(rootDir)
      const conflicts = detectKanbanFileConflicts(board)
      return createJsonResponse(200, { conflicts })
    },

    async handleExport(): Promise<ApiResponse> {
      try {
        const { path } = await exportKanbanMarkdown(rootDir)
        return createJsonResponse(200, { path })
      } catch (error) {
        return createJsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleListTasks(): Promise<ApiResponse> {
      if (!(await kanbanBoardExists(rootDir))) {
        return createJsonResponse(404, { error: 'No Kanban board found' })
      }
      const tasks = await listKanbanTasks(rootDir)
      return createJsonResponse(200, { tasks })
    },

    async handleGetTask(id: string): Promise<ApiResponse> {
      try {
        const board = await readKanbanBoard(rootDir)
        const task = board.tasks.find(t => t.id === id)
        if (!task) {
          return createJsonResponse(404, { error: 'Task not found' })
        }
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleCompleteTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { summary, metadata } = body as { summary?: string; metadata?: Record<string, unknown> }
      try {
        const { task } = await completeKanbanTask(id, summary, metadata, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleCommentTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { author, body: commentBody } = body as { author?: string; body: string }
      if (!commentBody) {
        return createJsonResponse(400, { error: 'Comment body is required' })
      }
      try {
        const { task } = await commentKanbanTask(id, author || 'user', commentBody, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleArchiveTask(id: string): Promise<ApiResponse> {
      try {
        const { task } = await archiveKanbanTask(id, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Lease ────────────────────────────────────

    async handleClaimTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { workerId, claimedBy } = body as { workerId: string; claimedBy: string }
      if (!workerId) {
        return createJsonResponse(400, { error: 'workerId is required' })
      }
      try {
        const { task } = await claimKanbanTask(id, workerId, claimedBy || workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleHeartbeat(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { workerId } = body as { workerId: string }
      if (!workerId) {
        return createJsonResponse(400, { error: 'workerId is required' })
      }
      try {
        const { task } = await heartbeatKanbanTask(id, workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleReleaseTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { workerId } = body as { workerId: string }
      if (!workerId) {
        return createJsonResponse(400, { error: 'workerId is required' })
      }
      try {
        const { task } = await releaseKanbanTask(id, workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleReclaimTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { workerId, claimedBy } = body as { workerId: string; claimedBy: string }
      if (!workerId) {
        return createJsonResponse(400, { error: 'workerId is required' })
      }
      try {
        const { task } = await reclaimKanbanTask(id, workerId, claimedBy || workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Retry / Fail ──────────────────────────────

    async handleRetryTask(id: string, body: unknown): Promise<ApiResponse> {
      const workerId = body && typeof body === 'object' ? (body as { workerId?: string }).workerId : undefined
      try {
        const { task } = await retryKanbanTask(id, workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleFailTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { reason, workerId } = body as { reason: string; workerId?: string }
      if (!reason) {
        return createJsonResponse(400, { error: 'reason is required' })
      }
      try {
        const { task } = await failKanbanTask(id, reason, workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Verification ────────────────────────────

    async handleVerifyTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { passed, summary } = body as { passed: boolean; summary?: string }
      try {
        const { task } = await verifyKanbanTask(id, passed, summary, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleEvidenceTask(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { type, label, content, path } = body as { type: string; label: string; content?: string; path?: string }
      if (!type || !label) {
        return createJsonResponse(400, { error: 'type and label are required' })
      }
      try {
        const { task } = await addEvidenceToTask(id, type as any, label, rootDir, { content, path })
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleVerifyAndComplete(id: string, body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { summary, workerId } = body as { summary?: string; workerId?: string }
      try {
        const { task } = await verifyAndCompleteTask(id, summary, workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Events ──────────────────────────────────

    async handleGetEvents(id: string): Promise<ApiResponse> {
      try {
        const board = await readKanbanBoard(rootDir)
        const events = getTaskEvents(board, id)
        return createJsonResponse(200, { events })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Zombies ────────────────────────────────

    async handleListZombies(): Promise<ApiResponse> {
      try {
        const board = await readKanbanBoard(rootDir)
        const zombies = detectZombieTasks(board)
        return createJsonResponse(200, { zombies })
      } catch (error) {
        return createJsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleReclaimZombie(body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { taskId, workerId, claimedBy } = body as { taskId: string; workerId: string; claimedBy?: string }
      if (!taskId || !workerId) {
        return createJsonResponse(400, { error: 'taskId and workerId are required' })
      }
      try {
        const { task } = await reclaimKanbanTask(taskId, workerId, claimedBy || workerId, rootDir)
        return createJsonResponse(200, { task })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    // ─── Phase 3: Workspace / Project ─────────────────────

    async handleListWorkspaces(): Promise<ApiResponse> {
      try {
        await ensureDefaultWorkspace(rootDir)
        const workspaces = await listWorkspaces(rootDir)
        return createJsonResponse(200, { workspaces })
      } catch (error) {
        return createJsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleCreateWorkspace(body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { name, rootDir: wsRootDir } = body as { name: string; rootDir?: string }
      if (!name) {
        return createJsonResponse(400, { error: 'name is required' })
      }
      try {
        const ws = await createWorkspace(name, wsRootDir || rootDir, rootDir)
        return createJsonResponse(201, { workspace: ws })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleListProjects(): Promise<ApiResponse> {
      try {
        await ensureDefaultWorkspace(rootDir)
        const projects = await listProjects(undefined, rootDir)
        return createJsonResponse(200, { projects })
      } catch (error) {
        return createJsonResponse(500, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleCreateProject(body: unknown): Promise<ApiResponse> {
      if (!body || typeof body !== 'object') {
        return createJsonResponse(400, { error: 'Invalid request body' })
      }
      const { workspaceId, name, projectRootDir } = body as { workspaceId: string; name: string; projectRootDir?: string }
      if (!workspaceId || !name) {
        return createJsonResponse(400, { error: 'workspaceId and name are required' })
      }
      try {
        const proj = await createProject(workspaceId, name, projectRootDir, rootDir)
        return createJsonResponse(201, { project: proj })
      } catch (error) {
        return createJsonResponse(400, { error: error instanceof Error ? error.message : String(error) })
      }
    },

    async handleProjectTasks(projectId: string): Promise<ApiResponse> {
      try {
        const boardPath = await getProjectBoardPath(projectId, rootDir)
        // If using the default board path, read the shared board
        const board = await readKanbanBoard(rootDir)
        const projectTasks = board.tasks.filter(t => t.projectId === projectId || !t.projectId)
        return createJsonResponse(200, { tasks: projectTasks })
      } catch (error) {
        return createJsonResponse(404, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

function parseUrl(url: string): { path: string; id?: string; subPath?: string; projectId?: string } {
  const pathname = url.split('?')[0]
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) {
    return { path: '' }
  }
  if (parts[0] === 'api') {
    if (parts.length === 1) {
      return { path: 'api' }
    }
    if (parts[1] === 'board') {
      return { path: 'api/board' }
    }
    if (parts[1] === 'zombies') {
      if (parts.length >= 3 && parts[2] === 'reclaim') {
        return { path: 'api/zombies/reclaim' }
      }
      return { path: 'api/zombies' }
    }
    if (parts[1] === 'workspaces') {
      if (parts.length === 2) return { path: 'api/workspaces' }
      return { path: 'api/workspaces' }
    }
    if (parts[1] === 'projects') {
      if (parts.length === 2) return { path: 'api/projects' }
      if (parts.length >= 3) {
        const projectId = parts[2]
        if (parts.length >= 4 && parts[3] === 'tasks') {
          return { path: 'api/projects/:projectId/tasks', projectId }
        }
        return { path: 'api/projects/:projectId/tasks', projectId }
      }
    }
    if (parts[1] === 'tasks') {
      if (parts.length === 2) {
        return { path: 'api/tasks' }
      }
      if (parts.length >= 3) {
        const id = parts[2]
        if (parts.length === 3) {
          return { path: 'api/tasks/:id', id }
        }
        if (parts.length >= 4) {
          const subPath = parts[3]
          return { path: 'api/tasks/:id/' + subPath, id, subPath }
        }
      }
    }
    if (parts[1] === 'files') {
      return { path: 'api/files' }
    }
    if (parts[1] === 'conflicts') {
      return { path: 'api/conflicts' }
    }
    if (parts[1] === 'export') {
      return { path: 'api/export' }
    }
  }
  return { path: parts.join('/') }
}

function renderDashboard(): string {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Kanban Dashboard</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f5f5;padding:20px}h1{color:#333;margin-bottom:20px}.columns{display:flex;gap:15px;overflow-x:auto}.column{background:#e9ecef;border-radius:8px;padding:15px;min-width:200px;flex:1}.column h2{font-size:14px;margin-bottom:10px;color:#495057}.task-card{background:white;border-radius:6px;padding:10px;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);font-size:12px}.task-card.blocked{border-left:3px solid red}.task-card.done{opacity:0.6}.task-title{font-weight:600;margin-bottom:5px}.task-meta{color:#6c757d;font-size:11px}.task-actions{margin-top:8px}.task-actions button{padding:3px 8px;font-size:10px;margin-right:3px}</style></head><body><h1>Kanban Dashboard</h1><div id=zombieSection></div><div class="columns" id="columns"></div><script>const COLUMNS=["triage","todo","ready","running","blocked","done"];async function fetchBoard(){const r=await fetch("/api/tasks");if(!r.ok){alert("No board found. Create one with /kanban init");return null}const d=await r.json();return d.tasks||[]}async function fetchZombies(){try{const r=await fetch("/api/zombies");if(!r.ok)return[];const d=await r.json();return d.zombies||[]}catch{return[]}}function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function age(ts){const s=Math.floor((Date.now()-new Date(ts).getTime())/1000);if(s<60)return s+"s";const m=Math.floor(s/60);return m+"m "+s%60+"s"}async function renderZombies(){const z=await fetchZombies();const el=document.getElementById("zombieSection");if(z.length===0){el.innerHTML="";return}el.innerHTML="<h2 style=color:red>Zombie Tasks ("+z.length+")</h2>"+z.map(t=>"<div class=task-card style=border-left:3px solid darkred>"+esc(t.title)+" ("+t.id+") lease expired "+(t.lease?age(t.lease.expiresAt):"")+" <button onclick=reclaimZombie(\""+t.id+"\")>Reclaim</button></div>").join("")}async function reclaimZombie(id){const w=prompt("Worker ID:");if(!w)return;await fetch("/api/zombies/reclaim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({taskId:id,workerId:w,claimedBy:w})});renderBoard();renderZombies()}async function renderBoard(){const tasks=await fetchBoard();if(!tasks)return;const c=document.getElementById("columns");c.innerHTML=COLUMNS.map(x=>"<div class=column><h2>"+x.toUpperCase()+"</h2><div id=cards-"+x+"></div></div>").join("");for(const t of tasks){const d=document.createElement("div");const cls="task-card"+(t.status==="blocked"?" blocked":"")+(t.status==="done"?" done":"");d.className=cls;const prio=t.priority?" ["+t.priority+"]":"";const asn=t.assignee?" @"+t.assignee:"";const blk=t.blockedReason?"<br>Blocked: "+esc(t.blockedReason):"";const leaseInfo=t.lease?"<br>Lease: "+esc(t.lease.workerId)+" age:"+age(t.lease.lastHeartbeatAt||t.lease.claimedAt):"";const retryInfo=t.retry?"<br>Retry: "+t.retry.attempt+"/"+t.retry.maxAttempts+(t.retry.lastError?" err:"+esc(t.retry.lastError):""):"";const evi=t.verification&&t.verification.summary?"<br>Verification: "+esc(t.verification.summary):"";d.innerHTML="<div class=task-title>"+esc(t.title)+prio+"</div><div class=task-meta>"+t.id+asn+blk+leaseInfo+retryInfo+evi+"</div><div class=task-actions><button onclick=moveTask(\""+t.id+"\")>Move</button><button onclick=blockTask(\""+t.id+"\")>Block</button><button onclick=claimTask(\""+t.id+"\")>Claim</button><button onclick=heartbeatTask(\""+t.id+"\")>HB</button><button onclick=releaseTask(\""+t.id+"\")>Release</button><button onclick=completeTask(\""+t.id+"\")>Done</button><button onclick=failTask(\""+t.id+"\")>Fail</button><button onclick=retryBtn(\""+t.id+"\")>Retry</button><button onclick=deleteTask(\""+t.id+"\")>Del</button></div>";document.getElementById("cards-"+t.status).appendChild(d)}}async function moveTask(id){const s=prompt("Status:");if(!s)return;await fetch("/api/tasks/"+id+"/move",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:s})});renderBoard()}async function blockTask(id){const r=prompt("Block reason:");if(!r)return;await fetch("/api/tasks/"+id+"/block",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:r})});renderBoard();renderZombies()}async function claimTask(id){const w=prompt("Worker ID:");if(!w)return;await fetch("/api/tasks/"+id+"/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workerId:w,claimedBy:w})});renderBoard();renderZombies()}async function heartbeatTask(id){const w=prompt("Worker ID:");if(!w)return;await fetch("/api/tasks/"+id+"/heartbeat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workerId:w})});renderBoard()}async function releaseTask(id){const w=prompt("Worker ID:");if(!w)return;await fetch("/api/tasks/"+id+"/release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workerId:w})});renderBoard()}async function completeTask(id){const s=prompt("Summary (optional):")||"";await fetch("/api/tasks/"+id+"/complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({summary:s})});renderBoard();renderZombies()}async function failTask(id){const r=prompt("Failure reason:");if(!r)return;await fetch("/api/tasks/"+id+"/fail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:r})});renderBoard();renderZombies()}async function retryBtn(id){await fetch("/api/tasks/"+id+"/retry",{method:"POST",headers:{"Content-Type":"application/json"}});renderBoard()}async function deleteTask(id){if(!confirm("Delete?"))return;await fetch("/api/tasks/"+id,{method:"DELETE"});renderBoard();renderZombies()}renderBoard();renderZombies();setInterval(()=>{renderBoard();renderZombies()},5000);</script></body></html>'
}

export function startKanbanServer(options: ServerOptions = {}): Promise<{ url: string; close: () => void }> {
  const { port, rootDir } = options
  const handlers = createServerHandlers(rootDir)

  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = req.url || '/'
        const { path, id, subPath, projectId } = parseUrl(url)
        let response: ApiResponse

        let bodyStr = ''
        await new Promise<void>((resolvePromise) => {
          req.on('data', (chunk) => { bodyStr += chunk })
          req.on('end', resolvePromise)
        })
        const body = parseJsonBody(bodyStr)

        if (url === '/' || url.startsWith('/?')) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(renderDashboard())
          return
        }

        if (path === 'api/board') {
          response = await handlers.handleBoard()
        } else if (path === 'api/tasks') {
          if (req.method === 'GET') {
            response = await handlers.handleListTasks()
          } else if (req.method === 'POST') {
            response = await handlers.handleAddTask(body)
          } else {
            response = createJsonResponse(404, { error: 'Not found' })
          }
        } else if (path === 'api/files') {
          response = await handlers.handleFiles()
        } else if (path === 'api/conflicts') {
          response = await handlers.handleConflicts()
        } else if (path === 'api/export' && req.method === 'POST') {
          response = await handlers.handleExport()
        } else if (path === 'api/zombies') {
          response = await handlers.handleListZombies()
        } else if (path === 'api/zombies/reclaim' && req.method === 'POST') {
          response = await handlers.handleReclaimZombie(body)
        } else if (path === 'api/workspaces') {
          if (req.method === 'GET') {
            response = await handlers.handleListWorkspaces()
          } else if (req.method === 'POST') {
            response = await handlers.handleCreateWorkspace(body)
          } else {
            response = createJsonResponse(404, { error: 'Not found' })
          }
        } else if (path === 'api/projects') {
          if (req.method === 'GET') {
            response = await handlers.handleListProjects()
          } else if (req.method === 'POST') {
            response = await handlers.handleCreateProject(body)
          } else {
            response = createJsonResponse(404, { error: 'Not found' })
          }
        } else if (path.startsWith('api/projects') && projectId) {
          if (subPath === 'tasks' && req.method === 'GET') {
            response = await handlers.handleProjectTasks(projectId)
          } else {
            response = createJsonResponse(404, { error: 'Not found' })
          }
        } else if (path.startsWith('api/tasks/:id')) {
          if (!id) {
            response = createJsonResponse(400, { error: 'Task id required' })
          } else if (subPath === 'events' && req.method === 'GET') {
            response = await handlers.handleGetEvents(id)
          } else if (req.method === 'GET' && !subPath) {
            response = await handlers.handleGetTask(id)
          } else if (req.method === 'PATCH') {
            response = await handlers.handlePatchTask(id, body)
          } else if (req.method === 'DELETE') {
            response = await handlers.handleDeleteTask(id)
          } else if (subPath === 'move' && req.method === 'POST') {
            response = await handlers.handleMoveTask(id, body)
          } else if (subPath === 'block' && req.method === 'POST') {
            response = await handlers.handleBlockTask(id, body)
          } else if (subPath === 'unblock' && req.method === 'POST') {
            response = await handlers.handleUnblockTask(id)
          } else if (subPath === 'complete' && req.method === 'POST') {
            response = await handlers.handleVerifyAndComplete(id, body)
          } else if (subPath === 'comment' && req.method === 'POST') {
            response = await handlers.handleCommentTask(id, body)
          } else if (subPath === 'archive' && req.method === 'POST') {
            response = await handlers.handleArchiveTask(id)
          } else if (subPath === 'claim' && req.method === 'POST') {
            response = await handlers.handleClaimTask(id, body)
          } else if (subPath === 'heartbeat' && req.method === 'POST') {
            response = await handlers.handleHeartbeat(id, body)
          } else if (subPath === 'release' && req.method === 'POST') {
            response = await handlers.handleReleaseTask(id, body)
          } else if (subPath === 'reclaim' && req.method === 'POST') {
            response = await handlers.handleReclaimTask(id, body)
          } else if (subPath === 'retry' && req.method === 'POST') {
            response = await handlers.handleRetryTask(id, body)
          } else if (subPath === 'fail' && req.method === 'POST') {
            response = await handlers.handleFailTask(id, body)
          } else if (subPath === 'verify' && req.method === 'POST') {
            response = await handlers.handleVerifyTask(id, body)
          } else if (subPath === 'evidence' && req.method === 'POST') {
            response = await handlers.handleEvidenceTask(id, body)
          } else {
            response = createJsonResponse(404, { error: 'Not found' })
          }
        } else {
          response = createJsonResponse(404, { error: 'Not found' })
        }

        res.writeHead(response.status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '127.0.0.1'
        })
        res.end(JSON.stringify(response.body))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
      }
    })

    const listenPort = port || 0
    server.listen(listenPort, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const serverUrl = 'http://127.0.0.1:' + addr.port
        resolve({ url: serverUrl, close: () => { server.close() } })
      }
    })
  })
}

export async function openKanbanDashboard(port?: number, rootDir?: string): Promise<string> {
  const { url } = await startKanbanServer({ port, rootDir })
  await open(url)
  return url
}