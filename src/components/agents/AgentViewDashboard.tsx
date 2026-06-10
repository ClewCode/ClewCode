/**
 * AgentViewDashboard — Full-featured agent view TUI matching official Clew Code spec.
 *
 * Features:
 * - State icons with shape indicators (✻/✽/∙/✢)
 * - AI-generated row summaries (15s refresh)
 * - PR status tracking with colored dots
 * - Session organization: pin, rename, reorder, collapse groups
 * - Advanced filtering: a:<agent>, s:<state>, #<PR>
 * - Full keyboard shortcuts including ? help overlay
 * - Peek panel with reply, attach/detach lifecycle
 */

import * as React from 'react';
import figures from 'figures';
import { useAgentDispatchAutocomplete } from '../../hooks/useAgentDispatchAutocomplete.js';
import { useAgentViewSummaries } from '../../hooks/useAgentViewSummaries.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import { Pane } from '../design-system/Pane.js';
import { touchSessionAttach } from '../../services/SessionLifecycle/sessionLifecycle.js';
import { listSessions, pingDaemon } from '../../services/Supervisor/ipcClient.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { enterTeammateView } from '../../state/teammateViewHelpers.js';
import { createTaskStateBase } from '../../Task.js';
import type { ToolUseConfirm } from '../../Tool.js';
import {
  appendMessageToLocalAgent,
  isLocalAgentTask,
  killAsyncAgent,
  type LocalAgentTaskState,
  queuePendingMessage,
  registerAsyncAgent,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import type { TaskState } from '../../tasks/types.js';
import { GENERAL_PURPOSE_AGENT } from '../../tools/AgentTool/built-in/generalPurposeAgent.js';
import { createUserMessage } from '../../utils/messages.js';
import TextInput from '../TextInput.js';
import { parseDispatchSyntax } from './AgentViewDispatchInput.js';
import { AgentViewPeekPanel } from './AgentViewPeekPanel.js';
import {
  AgentViewGroupHeader,
  AgentViewRow,
  getTaskCategory,
  type PRDisplayInfo,
  type PRStatus,
  type TaskCategory,
} from './AgentViewRow.js';
import { AgentViewShortcutsHelp } from './AgentViewShortcutsHelp.js';
import { isWaitingForInput } from './utils.js';

type GroupMode = 'state' | 'directory';

type Props = {
  onBack: () => void;
  onDispatch?: (prompt: string) => void;
  cwd?: string;
};

const CATEGORY_ORDER: TaskCategory[] = ['needs-input', 'working', 'failed', 'stopped', 'completed'];

const CATEGORY_LABELS: Record<TaskCategory, { label: string; color: string }> = {
  'needs-input': { label: 'Needs input', color: 'yellow' },
  working: { label: 'Working', color: 'blue' },
  completed: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  stopped: { label: 'Stopped', color: 'grey' },
};

type SupervisorSession = {
  id?: string;
  sessionId?: string;
  agentId?: string;
  shortId?: string;
  cwd?: string;
  startedAt?: number;
  updatedAt?: number;
  status?: string;
  name?: string;
  customName?: string;
  agentType?: string;
  prompt?: string;
  awaitingInput?: boolean;
  awaiting_input?: boolean;
};

function supervisorSessionToTask(session: SupervisorSession): LocalAgentTaskState | null {
  const id = String(session.id ?? session.sessionId ?? session.agentId ?? '');
  if (!id) return null;

  const isAwaitingInput =
    session.status === 'awaiting_input' || session.awaitingInput === true || session.awaiting_input === true;
  const status =
    session.status === 'failed'
      ? 'failed'
      : session.status === 'stopped'
        ? 'killed'
        : session.status === 'completed'
          ? 'completed'
          : 'running';
  const description = session.name ?? session.prompt ?? session.shortId ?? id.slice(0, 8);

  return {
    ...createTaskStateBase(id, 'local_agent', description),
    id,
    type: 'local_agent',
    status,
    agentId: String(session.agentId ?? id),
    prompt: session.prompt ?? description,
    agentType: session.agentType ?? 'agent',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    startTime: session.startedAt ?? Date.now(),
    endTime: status === 'running' ? undefined : (session.updatedAt ?? Date.now()),
    progress: isAwaitingInput
      ? {
          toolUseCount: 0,
          tokenCount: 0,
          lastActivity: {
            toolName: 'AskUserQuestionTool',
            input: {},
            activityDescription: 'Waiting for your input',
          },
        }
      : undefined,
    processRunning: status === 'running',
    cwd: session.cwd,
    agentCwd: session.cwd,
    customName: session.customName ?? session.name,
    rowSummary: session.prompt,
    fromSupervisorRoster: true,
    sessionId: id,
  } as LocalAgentTaskState;
}

export function AgentViewDashboard({ onBack, onDispatch, cwd }: Props) {
  const { columns } = useTerminalSize();
  const tasks = useAppState((s: any) => s.tasks) as Record<string, TaskState>;
  const toolUseConfirmQueue = useAppState((s: any) => s.toolUseConfirmQueue) as ToolUseConfirm[];
  const agentDefinitions = useAppState((s: any) => s.agentDefinitions) as { activeAgents: any[]; allAgents: any[] };
  const setAppState = useSetAppState();

  // UI state
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [replyText, setReplyText] = React.useState('');
  const [cursorOffset, setCursorOffset] = React.useState(0);
  const [peekOpen, setPeekOpen] = React.useState(false);
  const [filterText, setFilterText] = React.useState('');
  const [dispatchText, setDispatchText] = React.useState('');
  const [dispatchCursor, setDispatchCursor] = React.useState(0);
  const [mode, setMode] = React.useState<'browse' | 'dispatch'>('browse');
  const [groupMode, setGroupMode] = React.useState<GroupMode>('state');
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<TaskCategory | string>>(new Set());
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = React.useState(false);
  const [stopConfirmIndex, setStopConfirmIndex] = React.useState<number | null>(null);
  const [stopConfirmTimer, setStopConfirmTimer] = React.useState<ReturnType<typeof setTimeout> | null>(null);
  const [renameSessionId, setRenameSessionId] = React.useState<string | null>(null);
  const [renameText, setRenameText] = React.useState('');

  // Resolve agents
  const agents = agentDefinitions?.activeAgents ?? [];
  const contentWidth = Math.max(56, Math.min(columns - 4, 118));

  // Auto-hide stop confirmation after 2 seconds
  React.useEffect(() => {
    if (stopConfirmIndex !== null && !stopConfirmTimer) {
      const timer = setTimeout(() => {
        setStopConfirmIndex(null);
        setStopConfirmTimer(null);
      }, 2000);
      setStopConfirmTimer(timer);
    }
    return () => {
      if (stopConfirmTimer) clearTimeout(stopConfirmTimer);
    };
  }, [stopConfirmIndex]);

  // Start summary & lifecycle polling
  useAgentViewSummaries({ tasks, setAppState });

  // Mirror daemon/supervisor background sessions into the dashboard so
  // `claude agents` shows sessions that are not part of this React process.
  React.useEffect(() => {
    let cancelled = false;

    const refreshSupervisorSessions = async () => {
      if (!(await pingDaemon())) return;
      const result = await listSessions();
      if (cancelled || !result.ok) return;

      const sessions = ((result.data as { sessions?: SupervisorSession[] } | undefined)?.sessions ?? [])
        .map(supervisorSessionToTask)
        .filter((task): task is LocalAgentTaskState => task !== null);

      setAppState(prev => {
        let changed = false;
        const nextTasks = { ...prev.tasks };
        const liveSupervisorIds = new Set(sessions.map(session => session.id));

        for (const sessionTask of sessions) {
          const existing = nextTasks[sessionTask.id] as any;
          if (existing && !existing.fromSupervisorRoster) continue;
          nextTasks[sessionTask.id] = existing ? { ...existing, ...sessionTask } : sessionTask;
          changed = true;
        }

        for (const [taskId, task] of Object.entries(nextTasks)) {
          if ((task as any).fromSupervisorRoster && !liveSupervisorIds.has(taskId)) {
            delete nextTasks[taskId];
            changed = true;
          }
        }

        return changed ? { ...prev, tasks: nextTasks } : prev;
      });
    };

    void refreshSupervisorSessions();
    const interval = setInterval(() => void refreshSupervisorSessions(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setAppState]);

  // Collect background tasks
  const backgroundTasks = React.useMemo(() => {
    let result = (Object.values(tasks) as TaskState[]).filter(
      task => isLocalAgentTask(task) && (task as any).isBackgrounded,
    ) as LocalAgentTaskState[];
    // When --cwd is specified, scope the session list to tasks in that directory
    if (cwd) {
      const cwdNormalized = cwd.replace(/\\/g, '/').toLowerCase();
      result = result.filter(task => {
        const taskCwd = ((task as any).cwd ?? (task as any).agentCwd ?? '') as string;
        return taskCwd.replace(/\\/g, '/').toLowerCase().startsWith(cwdNormalized);
      });
    }
    return result;
  }, [tasks, cwd]);

  // Parse advanced filter from filterText
  const parsedFilter = React.useMemo(() => parseDispatchSyntax(filterText), [filterText]);

  // Group tasks
  const groupedTasks = React.useMemo(() => {
    const result: { key: string; label: string; color: string; tasks: TaskState[]; isCollapsed: boolean }[] = [];

    if (groupMode === 'state') {
      // Group by state
      const byCategory: Record<TaskCategory, TaskState[]> = {
        'needs-input': [],
        working: [],
        completed: [],
        failed: [],
        stopped: [],
      };
      for (const task of backgroundTasks) {
        byCategory[getTaskCategory(task)].push(task);
      }

      // Apply internal sorting: pinned first, then by sortOrder, then by startTime
      for (const cat of CATEGORY_ORDER) {
        const catTasks = byCategory[cat];
        if (catTasks.length === 0) continue;

        catTasks.sort((a, b) => {
          const aPinned = (a as any).pinned ? 1 : 0;
          const bPinned = (b as any).pinned ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          const aOrder = (a as any).sortOrder ?? 0;
          const bOrder = (b as any).sortOrder ?? 0;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return ((b as any).startTime ?? 0) - ((a as any).startTime ?? 0);
        });

        const info = CATEGORY_LABELS[cat];
        result.push({
          key: cat,
          label: info.label,
          color: info.color,
          tasks: catTasks,
          isCollapsed: collapsedGroups.has(cat),
        });
      }
    } else {
      // Group by directory
      const byDir = new Map<string, TaskState[]>();
      for (const task of backgroundTasks) {
        const cwd = (task as any).cwd ?? (task as any).agentCwd ?? '(unknown)';
        if (!byDir.has(cwd)) byDir.set(cwd, []);
        byDir.get(cwd)!.push(task);
      }

      for (const [dir, dirTasks] of byDir) {
        dirTasks.sort((a, b) => {
          const aPinned = (a as any).pinned ? 1 : 0;
          const bPinned = (b as any).pinned ? 1 : 0;
          if (aPinned !== bPinned) return bPinned - aPinned;
          const aOrder = (a as any).sortOrder ?? 0;
          const bOrder = (b as any).sortOrder ?? 0;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return ((b as any).startTime ?? 0) - ((a as any).startTime ?? 0);
        });

        const dirName = dir.split('/').pop() ?? dir;
        result.push({
          key: dir,
          label: dirName,
          color: 'dim',
          tasks: dirTasks,
          isCollapsed: collapsedGroups.has(dir),
        });
      }
    }

    return result;
  }, [backgroundTasks, groupMode, collapsedGroups]);

  // Flatten for navigation (accounting for collapsed groups)
  const flatList = React.useMemo(() => {
    const result: Array<{ type: 'task'; task: LocalAgentTaskState; groupIndex: number }> = [];

    for (let gi = 0; gi < groupedTasks.length; gi++) {
      const group = groupedTasks[gi]!;
      if (!group.isCollapsed) {
        for (const task of group.tasks) {
          result.push({ type: 'task', task: task as LocalAgentTaskState, groupIndex: gi });
        }
      }
    }

    return result;
  }, [groupedTasks]);

  // Apply text filters
  const filteredList = React.useMemo(() => {
    if (!filterText.trim()) return flatList;

    const lower = filterText.toLowerCase();

    // Advanced filter: a:<name>
    if (parsedFilter.isFilter) {
      return flatList.filter(item => {
        const lt = item.task as LocalAgentTaskState;

        if (parsedFilter.filterAgent) {
          const agentFilter = parsedFilter.filterAgent.toLowerCase();
          return lt.agentType?.toLowerCase().includes(agentFilter) ?? false;
        }
        if (parsedFilter.filterState) {
          const stateFilter = parsedFilter.filterState.toLowerCase();
          if (stateFilter === 'blocked') {
            return (
              isWaitingForInput(lt) ||
              toolUseConfirmQueue.some(
                (c: any) => c.toolUseContext.agentId === lt.id || c.toolUseContext.agentId === (lt as any).taskId,
              )
            );
          }
          const cat = getTaskCategory(lt);
          return cat.includes(stateFilter) || (stateFilter === 'stopped' && cat === 'stopped');
        }
        if (parsedFilter.isPRLookup && parsedFilter.prNumber) {
          const prInfo = (lt as any)._prInfo;
          return prInfo?.number === parsedFilter.prNumber;
        }
        return true;
      });
    }

    return flatList.filter(item => {
      const lt = item.task as LocalAgentTaskState;
      if (lt.prompt?.toLowerCase().includes(lower)) return true;
      if (lt.agentType?.toLowerCase().includes(lower)) return true;
      if (lt.id?.toLowerCase().includes(lower)) return true;
      if ((lt as any).customName?.toLowerCase().includes(lower)) return true;
      if ((lt as any).rowSummary?.toLowerCase().includes(lower)) return true;
      return false;
    });
  }, [flatList, filterText, parsedFilter, toolUseConfirmQueue]);

  // Autocomplete for dispatch input (must be after backgroundTasks definition)
  const activeInput = dispatchText || filterText;
  const activeCursor = dispatchText ? dispatchCursor : cursorOffset;
  const autocompleteSources = React.useMemo(
    () => ({
      agents: agents.map((a: any) => ({
        name: a.name ?? a.agentType ?? '',
        description: a.description ?? '',
      })),
      skills: [],
      prNumbers: backgroundTasks
        .map(t => (t as any)._prInfo?.number)
        .filter((n: number | undefined): n is number => n !== undefined),
      agentNames: agents.map((a: any) => a.agentType ?? a.name ?? '').filter(Boolean),
    }),
    [agents, backgroundTasks],
  );
  const autocomplete = useAgentDispatchAutocomplete(activeInput, activeCursor, autocompleteSources);

  const selectedTask = filteredList[selectedIndex]?.task;

  // Clamp selectedIndex when list changes
  React.useEffect(() => {
    if (filteredList.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= filteredList.length) {
      setSelectedIndex(Math.max(0, filteredList.length - 1));
    }
  }, [filteredList.length, selectedIndex]);

  // Pending permissions for selected task
  const pendingPermissions = React.useMemo(() => {
    if (!selectedTask) return [];
    return toolUseConfirmQueue.filter(
      (confirm: any) =>
        confirm.toolUseContext.agentId === (selectedTask as any).id ||
        confirm.toolUseContext.agentId === (selectedTask as any).taskId,
    );
  }, [selectedTask, toolUseConfirmQueue]);

  const handleReplySubmit = (text: string) => {
    if (!selectedTask) return;
    const userMsg = createUserMessage({ content: text });
    appendMessageToLocalAgent(selectedTask.id, userMsg, setAppState);
    queuePendingMessage(selectedTask.id, text, setAppState);
    setReplyText('');
  };

  const handleDispatch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Too short guard (official spec: <4 chars rejected)
    if (trimmed.length < 4) return;

    const parsed = parseDispatchSyntax(trimmed);

    // Check if this is a PR lookup — select matching session instead
    if (parsed.isPRLookup && parsed.prNumber) {
      for (let i = 0; i < flatList.length; i++) {
        const item = flatList[i];
        const prInfo = (item?.task as any)?._prInfo;
        if (prInfo?.number === parsed.prNumber) {
          setFilterText('');
          setSelectedIndex(i);
          return;
        }
      }
      return;
    }

    let agentName = parsed.agentName;
    // Resolve agent name: check if first word matches an agent
    if (!agentName) {
      const firstWord = trimmed.split(/\s+/)[0];
      if (firstWord) {
        const matched = agents.find((a: any) => a.agentType?.toLowerCase() === firstWord.toLowerCase());
        if (matched) agentName = matched.agentType;
      }
    }

    const selectedAgent = agentName
      ? agents.find((a: any) => a.agentType?.toLowerCase() === agentName!.toLowerCase())
      : (agents?.[0] ?? GENERAL_PURPOSE_AGENT);

    const prompt = agentName ? trimmed.replace(new RegExp(`^@?${agentName}\\s*`, 'i'), '').trim() || trimmed : trimmed;

    if (onDispatch) {
      onDispatch(prompt);
    } else {
      registerAsyncAgent({
        agentId: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        description: prompt.slice(0, 80),
        prompt,
        selectedAgent,
        setAppState,
      });
    }
    setDispatchText('');
    setMode('browse');
  };

  const handleAttach = () => {
    if (!selectedTask) return;
    touchSessionAttach(selectedTask.id);
    (enterTeammateView as any)(selectedTask.id, setAppState);
    onBack();
  };

  const handleStopTask = (taskId: string) => {
    killAsyncAgent(taskId, setAppState);
  };

  const handleDeleteTask = (taskId: string) => {
    // Remove from app state
    setAppState(prev => {
      const { [taskId]: _, ...rest } = prev.tasks;
      return { ...prev, tasks: rest };
    });
  };

  const handlePinToggle = () => {
    if (!selectedTask) return;
    setAppState(prev => {
      const task = prev.tasks[selectedTask.id];
      if (!task) return prev;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [selectedTask.id]: { ...task, pinned: !(task as any).pinned } as any,
        },
      };
    });
  };

  const handleRenameStart = () => {
    if (!selectedTask) return;
    setRenameSessionId(selectedTask.id);
    setRenameText((selectedTask as any).customName ?? selectedTask.agentType ?? '');
  };

  const handleRenameSubmit = () => {
    if (!renameSessionId) return;
    setAppState(prev => {
      const task = prev.tasks[renameSessionId];
      if (!task) return prev;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [renameSessionId]: { ...task, customName: renameText.trim() || undefined } as any,
        },
      };
    });
    setRenameSessionId(null);
    setRenameText('');
  };

  const handleReorder = (direction: -1 | 1) => {
    if (!selectedTask) return;
    const currentOrder = (selectedTask as any).sortOrder ?? 0;
    setAppState(prev => {
      const task = prev.tasks[selectedTask.id];
      if (!task) return prev;
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [selectedTask.id]: { ...task, sortOrder: currentOrder + direction } as any,
        },
      };
    });
  };

  const handleGroupToggle = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Handle Ctrl+G — open dispatch in $EDITOR
  const handleOpenInEditor = React.useCallback(async () => {
    const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'vi');
    const { spawn } = await import('child_process');
    // Write current dispatch text to a tmp file, open in editor, read back
    const tmpFile = (await import('os')).tmpdir() + `/claude-dispatch-${Date.now()}.txt`;
    await (await import('fs/promises')).writeFile(tmpFile, dispatchText || '', 'utf-8');
    await new Promise<void>(resolve => {
      const proc = spawn(editor, [tmpFile], { stdio: 'inherit' });
      proc.on('exit', () => resolve());
      proc.on('error', () => resolve()); // editor not found
    });
    try {
      const edited = await (await import('fs/promises')).readFile(tmpFile, 'utf-8');
      setDispatchText(edited.trim());
      await (await import('fs/promises')).unlink(tmpFile).catch(() => {});
    } catch {
      // editor not found or file read error — silently ignore
    }
  }, [dispatchText]);

  useInput((input, key) => {
    // Handle help overlay
    if (shortcutsHelpOpen) {
      if (key.escape || input === '?') {
        setShortcutsHelpOpen(false);
      }
      return;
    }

    // Handle rename mode
    if (renameSessionId !== null) {
      if (key.return) {
        handleRenameSubmit();
      } else if (key.escape) {
        setRenameSessionId(null);
        setRenameText('');
      }
      return;
    }

    // Alt+1..9 to jump to session
    if (flatList.length > 0) {
      const altNum =
        input.match(/^[¹²³⁴⁵⁶⁷⁸⁹]/) || (input.length === 1 && input >= '1' && input <= '9' && key.meta ? input : null);
      // Simplified: just check if input.charCodeAt(0) between 49-57 during Alt
      // Ink's useInput doesn't reliably report Alt; we handle this in keybindings instead
    }

    if ((mode === 'dispatch' || dispatchText !== '') && dispatchText !== '') {
      if (key.escape) {
        setDispatchText('');
        setMode('browse');
        return;
      }
      return;
    }

    if (key.escape) {
      if (peekOpen) {
        setPeekOpen(false);
      } else if (filterText) {
        setFilterText('');
      } else if (mode === 'dispatch' && !dispatchText) {
        setMode('browse');
      } else {
        onBack();
      }
      return;
    }

    // Ctrl+C — clear input, twice to exit
    if (input === ('\x03' as any)) {
      // Already handled by useExitOnCtrlCDWithKeybindings in parent
      return;
    }

    if (input === '?') {
      setShortcutsHelpOpen(true);
      return;
    }

    // Navigation
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filteredList.length - 1, prev + 1));
      return;
    }

    // Enter: attach or expand group
    if (key.return) {
      if (selectedTask) {
        if ((selectedTask as any).fromSupervisorRoster) {
          setPeekOpen(true);
          return;
        }
        if (isWaitingForInput(selectedTask)) {
          // Do nothing — Space to peek first
        } else {
          handleAttach();
        }
      }
      return;
    }

    // Space: peek
    if (input === ' ' && selectedTask) {
      if (key.shift) {
        // Shift+Space: Dispatch and attach
        handleDispatch(dispatchText || '');
        if (filteredList.length > 0) handleAttach();
      } else {
        setPeekOpen(prev => !prev);
      }
      return;
    }

    // → : attach
    if (key.rightArrow && selectedTask) {
      if ((selectedTask as any).fromSupervisorRoster) {
        setPeekOpen(true);
        return;
      }
      handleAttach();
      return;
    }

    // Ctrl+T: pin toggle
    if (input === ('\x14' as any) && selectedTask) {
      handlePinToggle();
      return;
    }

    // Ctrl+R: rename
    if (input === ('\x12' as any) && selectedTask) {
      handleRenameStart();
      return;
    }

    // Ctrl+S: toggle grouping
    if (input === ('\x13' as any)) {
      setGroupMode(prev => (prev === 'state' ? 'directory' : 'state'));
      return;
    }

    // Ctrl+G: open in editor
    if (input === ('\x07' as any)) {
      handleOpenInEditor();
      return;
    }

    // Ctrl+X: stop (x2 to delete)
    if (input === ('\x18' as any) && selectedTask) {
      const currentIndex = selectedIndex;
      if (stopConfirmIndex === currentIndex) {
        // Second press within 2s — delete
        handleDeleteTask(selectedTask.id);
        setStopConfirmIndex(null);
        if (stopConfirmTimer) clearTimeout(stopConfirmTimer);
        setStopConfirmTimer(null);
      } else {
        // First press — stop
        handleStopTask(selectedTask.id);
        setStopConfirmIndex(currentIndex);
      }
      return;
    }

    // l: logout/stop the selected session (with confirmation)
    if (input === 'l' && selectedTask && mode === 'browse' && !filterText) {
      const currentIndex = selectedIndex;
      if (stopConfirmIndex === currentIndex) {
        // Second press within 2s — confirm logout/delete
        handleDeleteTask(selectedTask.id);
        setStopConfirmIndex(null);
        if (stopConfirmTimer) clearTimeout(stopConfirmTimer);
        setStopConfirmTimer(null);
      } else {
        // First press — stop
        handleStopTask(selectedTask.id);
        setStopConfirmIndex(currentIndex);
      }
      return;
    }

    // Tab: accept autocomplete suggestion / browse subagents
    if (key.tab) {
      if (autocomplete.suggestions.length > 0 && dispatchText) {
        const result = autocomplete.accept(dispatchText, dispatchCursor);
        if (result) {
          setDispatchText(result.text);
          setDispatchCursor(result.offset);
        }
        return;
      }
      if (selectedTask && isWaitingForInput(selectedTask)) {
        // Apply suggested reply
        setReplyText('Continue with the task');
        return;
      }
      if (!dispatchText.trim() && mode === 'browse') {
        // Show subagent browser
        setMode('dispatch');
      }
      return;
    }

    // Up/down: navigate autocomplete suggestions when showing
    if (autocomplete.suggestions.length > 0 && dispatchText) {
      if (key.upArrow) {
        const { setSelectedIndex } = autocomplete;
        setSelectedIndex((prev: number) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        const { setSelectedIndex, suggestions } = autocomplete;
        setSelectedIndex((prev: number) => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
    }

    // Shift+↑ / Shift+↓ : reorder
    if (key.shift && key.upArrow && selectedTask) {
      handleReorder(-1);
      return;
    }
    if (key.shift && key.downArrow && selectedTask) {
      handleReorder(1);
      return;
    }

    // / : start dispatch
    if (input === '/' && mode === 'browse') {
      setMode('dispatch');
      return;
    }

    // f : toggle filter
    if (input === 'f' && mode === 'browse') {
      if (filterText) {
        setFilterText('');
        setMode('browse');
      } else {
        setMode('dispatch');
      }
      return;
    }

    // Arrow keys ← → for navigation when not in dispatch mode
    // Guard against stale events during streaming on Windows: only process
    // arrow keys when not in dispatch mode and no input is pending.
    if (mode === 'browse' && !dispatchText && !key.ctrl && !key.meta) {
      if (key.leftArrow && !peekOpen) {
        onBack();
        return;
      }
    }
  });

  const counts = {
    awaiting: backgroundTasks.filter(task => getTaskCategory(task) === 'needs-input').length,
    working: backgroundTasks.filter(task => getTaskCategory(task) === 'working').length,
    completed: backgroundTasks.filter(task => getTaskCategory(task) === 'completed').length,
  };
  const cwdLabel = cwd ? (cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd) : process.cwd().split(/[\\/]/).at(-1);
  const divider = '─'.repeat(contentWidth);
  const inputPlaceholder = filterText ? 'filter sessions' : 'describe a task for a new session';
  return (
    <Pane color="permission">
      <Box flexDirection="column" width={contentWidth} paddingLeft={1}>
        {/* Header */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="permission">
            Clew Code
          </Text>
          <Text dimColor>
            Opus · 1M context · ~/{cwdLabel ?? 'workspace'}
          </Text>
          <Box flexDirection="row" gap={1}>
            {counts.awaiting > 0 && (
              <Text color="yellow">
                {figures.bullet} {counts.awaiting} awaiting
              </Text>
            )}
            {counts.working > 0 && (
              <Text color="blue">
                {counts.awaiting > 0 ? ' · ' : ''}
                {figures.circleDotted} {counts.working} working
              </Text>
            )}
            {counts.completed > 0 && (
              <Text color="green">
                {(counts.awaiting > 0 || counts.working > 0) ? ' · ' : ''}
                {figures.tick} {counts.completed} completed
              </Text>
            )}
            {counts.awaiting === 0 && counts.working === 0 && counts.completed === 0 && (
              <Text dimColor>No background agents</Text>
            )}
          </Box>
        </Box>

      {backgroundTasks.length === 0 ? (
        <Box flexDirection="column" marginY={1} paddingLeft={2}>
          <Text dimColor>No background agents are currently running.</Text>
          <Text dimColor>Type a task below or use @agent to dispatch.</Text>
        </Box>
      ) : (
        groupedTasks.map(group => {
          const info = CATEGORY_LABELS[group.key as TaskCategory] ?? { label: group.label, color: 'dim' };
          return (
            <React.Fragment key={group.key}>
              <AgentViewGroupHeader
                label={info.label}
                count={group.tasks.length}
                color={info.color}
                isCollapsed={group.isCollapsed}
                onToggle={() => handleGroupToggle(group.key)}
                isSelected={false}
              />
              {!group.isCollapsed &&
                group.tasks.map(task => {
                  const lt = task as LocalAgentTaskState;
                  const flatIdx = flatList.findIndex(item => item.task?.id === lt.id);
                  const isSelected = flatIdx === selectedIndex;
                  const prInfo = (lt as any)._prInfo as PRDisplayInfo | undefined;

                  return (
                    <AgentViewRow
                      key={task.id}
                      task={lt}
                      index={flatIdx}
                      isSelected={isSelected}
                      prCount={prInfo ? 1 : 0}
                      prStatus={prInfo?.status as PRStatus | null}
                      prUrl={prInfo?.url as string | null}
                      prDisplayInfo={prInfo ?? null}
                      width={contentWidth}
                    />
                  );
                })}
            </React.Fragment>
          );
        })
      )}

      <Box flexGrow={1} minHeight={2} />

      {stopConfirmIndex !== null && selectedTask && (
        <Box marginBottom={1}>
          <Text color="error">
            press ctrl+x again to delete {(selectedTask as any).customName ?? selectedTask.agentType ?? selectedTask.id}
          </Text>
        </Box>
      )}

      {peekOpen && selectedTask && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>{divider}</Text>
          <AgentViewPeekPanel
            task={selectedTask}
            pendingPermissions={pendingPermissions as ToolUseConfirm[]}
            replyText={replyText}
            onReplyChange={setReplyText}
            onReplySubmit={handleReplySubmit}
            cursorOffset={cursorOffset}
            onCursorOffsetChange={setCursorOffset}
          />
        </Box>
      )}

      {renameSessionId !== null && (
        <Box flexDirection="row" gap={1} marginBottom={1}>
          <Text color="suggestion">rename</Text>
          <Text dimColor={!renameText}>{renameText || '(empty)'}</Text>
          <Text dimColor>enter to confirm · esc to cancel</Text>
        </Box>
      )}

      <Text dimColor>{divider}</Text>
      <Box flexDirection="row" height={1} alignItems="center">
        <Text bold color="suggestion">› </Text>
        <TextInput
          value={filterText || dispatchText}
          onChange={text => {
            if (filterText) {
              setFilterText(text);
              if (!text) setMode('browse');
            } else {
              setDispatchText(text);
              if (text) setMode('dispatch');
            }
          }}
          onSubmit={text => {
            if (filterText) return;
            handleDispatch(text);
          }}
          columns={Math.max(10, contentWidth - 2)}
          cursorOffset={dispatchCursor}
          onChangeCursorOffset={setDispatchCursor}
          placeholder={inputPlaceholder}
        />
      </Box>
      <Text dimColor>{divider}</Text>

      {/* Autocomplete suggestions dropdown */}
      {autocomplete.suggestions.length > 0 && dispatchText && (
        <Box flexDirection="column" marginBottom={1}>
          {autocomplete.suggestions.map((sug, i) => {
            const isSelected = i === autocomplete.selectedIndex;
            return (
              <Box key={`${sug.type}-${sug.text}`} flexDirection="row" gap={1}>
                <Text color={(isSelected ? 'cyan' : 'dim') as any}>{isSelected ? '▸' : ' '}</Text>
                <Text bold={isSelected} color={(isSelected ? 'text' : 'dim') as any}>
                  {autocomplete.prefix}
                  {sug.text}
                </Text>
                <Text dimColor>{sug.description}</Text>
              </Box>
            );
          })}
          <Text dimColor>tab to accept · ↑↓ to navigate</Text>
        </Box>
      )}

      <Text dimColor>
        enter:open · space:peek · /:dispatch · ?:help · esc:back
      </Text>

      {shortcutsHelpOpen && <AgentViewShortcutsHelp onClose={() => setShortcutsHelpOpen(false)} />}
      </Box>
    </Pane>
  );
}
