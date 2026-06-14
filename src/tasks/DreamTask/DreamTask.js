// Background task entry for auto-dream (memory consolidation subagent).
// Makes the otherwise-invisible forked agent visible in the footer pill and
// Shift+Down dialog. The dream agent itself is unchanged — this is pure UI
// surfacing via the existing task registry.
import { rollbackConsolidationLock } from '../../services/autoDream/consolidationLock.js';
import { createTaskStateBase, generateTaskId } from '../../Task.js';
import { registerTask, updateTaskState } from '../../utils/task/framework.js';
// Keep only the N most recent turns for live display.
const MAX_TURNS = 30;
export function isDreamTask(task) {
    return typeof task === 'object' && task !== null && 'type' in task && task.type === 'dream';
}
export function registerDreamTask(setAppState, opts) {
    const id = generateTaskId('dream');
    const task = {
        ...createTaskStateBase(id, 'dream', 'dreaming'),
        type: 'dream',
        status: 'running',
        phase: 'starting',
        sessionsReviewing: opts.sessionsReviewing,
        filesTouched: [],
        turns: [],
        abortController: opts.abortController,
        priorMtime: opts.priorMtime,
    };
    registerTask(task, setAppState);
    return id;
}
export function addDreamTurn(taskId, turn, touchedPaths, setAppState) {
    updateTaskState(taskId, setAppState, task => {
        const seen = new Set(task.filesTouched);
        const newTouched = touchedPaths.filter(p => !seen.has(p) && seen.add(p));
        // Skip the update entirely if the turn is empty AND nothing new was
        // touched. Avoids re-rendering on pure no-ops.
        if (turn.text === '' && turn.toolUseCount === 0 && newTouched.length === 0) {
            return task;
        }
        return {
            ...task,
            phase: newTouched.length > 0 ? 'updating' : task.phase,
            filesTouched: newTouched.length > 0 ? [...task.filesTouched, ...newTouched] : task.filesTouched,
            turns: task.turns.slice(-(MAX_TURNS - 1)).concat(turn),
        };
    });
}
export function completeDreamTask(taskId, setAppState) {
    // notified: true immediately — dream has no model-facing notification path
    // (it's UI-only), and eviction requires terminal + notified. The inline
    // appendSystemMessage completion note IS the user surface.
    updateTaskState(taskId, setAppState, task => ({
        ...task,
        status: 'completed',
        endTime: Date.now(),
        notified: true,
        abortController: undefined,
    }));
}
export function failDreamTask(taskId, setAppState) {
    updateTaskState(taskId, setAppState, task => ({
        ...task,
        status: 'failed',
        endTime: Date.now(),
        notified: true,
        abortController: undefined,
    }));
}
export const DreamTask = {
    name: 'DreamTask',
    type: 'dream',
    async kill(taskId, setAppState) {
        let priorMtime;
        updateTaskState(taskId, setAppState, task => {
            if (task.status !== 'running')
                return task;
            task.abortController?.abort();
            priorMtime = task.priorMtime;
            return {
                ...task,
                status: 'killed',
                endTime: Date.now(),
                notified: true,
                abortController: undefined,
            };
        });
        // Rewind the lock mtime so the next session can retry. Same path as the
        // fork-failure catch in autoDream.ts. If updateTaskState was a no-op
        // (already terminal), priorMtime stays undefined and we skip.
        if (priorMtime !== undefined) {
            await rollbackConsolidationLock(priorMtime);
        }
    },
};
