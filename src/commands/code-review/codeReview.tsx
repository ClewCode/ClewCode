import type * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from '../../ink.js';
import { isLocalAgentTask, registerAsyncAgent, type ToolActivity } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { runAsyncAgentLifecycle } from '../../tools/AgentTool/agentToolUtils.js';
import { GENERAL_PURPOSE_AGENT } from '../../tools/AgentTool/built-in/generalPurposeAgent.js';
import { type AgentDefinition, isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js';
import { runAgent } from '../../tools/AgentTool/runAgent.js';
import { assembleToolPool } from '../../tools.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { asAgentId } from '../../types/ids.js';
import type { Message } from '../../types/message.js';
import { formatDuration } from '../../utils/format.js';
import { createUserMessage, extractTextContent } from '../../utils/messages.js';
import { getAgentModel } from '../../utils/model/agent.js';
import type { ModelAlias } from '../../utils/model/aliases.js';
import { createAgentId } from '../../utils/uuid.js';

type PhaseId = 'scope' | 'find' | 'verify' | 'sweep' | 'synthesize';
type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

type ReviewPhase = {
  id: PhaseId;
  label: string;
};

type ReviewWorker = {
  key: string;
  phase: PhaseId;
  label: string;
  status: AgentStatus;
  taskId?: string;
  summary?: string;
  error?: string;
  tokenCount?: number;
  toolUseCount?: number;
  model?: string;
  prompt?: string;
  startedAt?: number;
  completedAt?: number;
  recentActivities?: ToolActivity[];
};

type RunnerState = {
  activePhase: PhaseId;
  selectedPhase: PhaseId;
  selectedWorkerKey?: string;
  view: 'overview' | 'detail';
  workers: ReviewWorker[];
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  result?: string;
  error?: string;
};

type RunnerOptions = {
  effort: 'low' | 'medium' | 'high';
  modelOverride?: string;
  shouldFix: boolean;
};

type WorkerSpec = {
  key: string;
  phase: PhaseId;
  label: string;
  prompt: string;
};

const PHASES: ReviewPhase[] = [
  { id: 'scope', label: 'Scope' },
  { id: 'find', label: 'Find' },
  { id: 'verify', label: 'Verify' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'synthesize', label: 'Synthesize' },
];

const BASE_FINDERS = [
  {
    key: 'angle-A',
    label: 'angle-A',
    focus: 'correctness bugs: wrong behavior, broken control flow, bad state transitions, runtime failures',
  },
  {
    key: 'angle-B',
    label: 'angle-B',
    focus:
      'integration and contract bugs: API shape mismatch, imports, provider/tool contracts, persistence, async lifecycle',
  },
  {
    key: 'angle-C',
    label: 'angle-C',
    focus: 'edge cases and regressions: cancellation, errors, empty state, concurrency, cross-platform behavior',
  },
  {
    key: 'cleanup',
    label: 'cleanup',
    focus: 'cleanup-only findings: dead code, duplication, naming drift, unnecessary complexity, stale docs or tests',
  },
] as const;

function effortFromArgs(args: string): RunnerOptions['effort'] {
  const match = args.match(/\b(low|medium|high)\b/i);
  return match ? (match[1]!.toLowerCase() as RunnerOptions['effort']) : 'medium';
}

function parseRunnerOptions(args: string): RunnerOptions {
  const modelMatch = args.match(/(?:^|\s)--model(?:=|\s+)([^\s]+)/i);
  return {
    effort: effortFromArgs(args),
    modelOverride: modelMatch?.[1],
    shouldFix: /\s--fix(?:\s|$)/i.test(` ${args} `),
  };
}

function initialWorkers(): ReviewWorker[] {
  return [
    { key: 'scope', phase: 'scope', label: 'scope', status: 'pending' },
    ...BASE_FINDERS.map(finder => ({
      key: finder.key,
      phase: 'find' as const,
      label: finder.label,
      status: 'pending' as const,
    })),
    { key: 'sweep', phase: 'sweep', label: 'sweep', status: 'pending' },
    { key: 'synthesize', phase: 'synthesize', label: 'synthesize', status: 'pending' },
  ];
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  return <CodeReviewRunner args={args} context={context} onDone={onDone} />;
}

function CodeReviewRunner({
  args,
  context,
  onDone,
}: {
  args: string;
  context: LocalJSXCommandContext;
  onDone: LocalJSXCommandOnDone;
}): React.ReactNode {
  const options = useMemo(() => parseRunnerOptions(args), [args]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const doneRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<RunnerState>(() => ({
    activePhase: 'scope',
    selectedPhase: 'scope',
    selectedWorkerKey: 'scope',
    view: 'overview',
    workers: initialWorkers(),
    status: 'idle',
    startedAt: Date.now(),
  }));

  useInput((input, key) => {
    const normalized = input.toLowerCase();

    if (key.tab || normalized === '\t') {
      setState(prev => ({ ...prev, view: prev.view === 'overview' ? 'detail' : 'overview' }));
      return;
    }
    if (key.return) {
      setState(prev => ({ ...prev, view: 'detail' }));
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      setState(prev => selectAdjacentPhase(prev, key.leftArrow ? -1 : 1));
      return;
    }
    if (key.upArrow || key.downArrow) {
      setState(prev => selectAdjacentWorker(prev, key.upArrow ? -1 : 1));
      return;
    }
    if (key.escape && state.view === 'detail') {
      setState(prev => ({ ...prev, view: 'overview' }));
      return;
    }
    if (key.escape || normalized === 'q') {
      abortControllerRef.current?.abort();
      setState(prev => ({
        ...prev,
        status: 'cancelled',
        result: 'code-review cancelled',
        workers: prev.workers.map(worker =>
          worker.status === 'running' || worker.status === 'pending'
            ? { ...worker, status: 'cancelled', completedAt: Date.now() }
            : worker,
        ),
      }));
      if (!doneRef.current) {
        doneRef.current = true;
        onDone('code-review cancelled', { display: 'system' });
      }
    }
  });

  useEffect(() => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setState(prev => ({ ...prev, status: 'running', startedAt: Date.now() }));

    void runCodeReviewWorkflow({
      args,
      context,
      options,
      abortController,
      setState,
    })
      .then(result => {
        if (doneRef.current) return;
        doneRef.current = true;
        setState(prev => ({
          ...prev,
          status: 'completed',
          activePhase: 'synthesize',
          selectedPhase: 'synthesize',
          selectedWorkerKey: 'synthesize',
          result,
        }));
        onDone(result, { display: 'system' });
      })
      .catch(error => {
        if (doneRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        doneRef.current = true;
        setState(prev => ({
          ...prev,
          status: abortController.signal.aborted ? 'cancelled' : 'failed',
          error: message,
        }));
        onDone(`code-review failed: ${message}`, { display: 'system' });
      });

    return () => {
      abortController.abort();
    };
  }, [args, context, onDone, options]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      setState(prev => hydrateWorkersFromTasks(prev, context));
    }, 1000);
    return () => clearInterval(interval);
  }, [context]);

  const activePhase = PHASES.find(phase => phase.id === state.activePhase) ?? PHASES[0]!;
  const selectedPhase = PHASES.find(phase => phase.id === state.selectedPhase) ?? activePhase;
  const visibleWorkers = state.workers.filter(worker => worker.phase === selectedPhase.id);
  const selectedWorker =
    visibleWorkers.find(worker => worker.key === state.selectedWorkerKey) ??
    visibleWorkers.find(worker => worker.status === 'running') ??
    visibleWorkers[0];
  const runningWorkers = state.workers.filter(worker => worker.status === 'running').length;
  const completedWorkers = state.workers.filter(worker => worker.status === 'completed').length;
  const elapsed = formatDuration(now - state.startedAt);

  return (
    <Box flexDirection="column" borderTop borderColor="ansi:whiteBright" paddingTop={1}>
      <Text color="permission">code-review</Text>
      <Text dimColor wrap="truncate-end">
        Workflow-backed code review - one finder per correctness angle plus one finder covering all cleanup angles, an
        independent verifier for every distinct file:line finding * {completedWorkers}/{state.workers.length} agents
        {runningWorkers > 0 ? ` (${runningWorkers} running)` : ''} * {elapsed}
      </Text>

      <Box marginTop={1} borderStyle="single" borderColor="ansi:whiteBright" flexDirection="row" paddingX={1}>
        {state.view === 'detail' && selectedWorker ? (
          <WorkerDetailLayout
            workers={visibleWorkers}
            selectedPhase={selectedPhase}
            selectedWorker={selectedWorker}
            now={now}
          />
        ) : (
          <>
            <PhaseRail state={state} activePhase={activePhase} />
            <WorkerOverviewPanel
              state={state}
              selectedPhase={selectedPhase}
              selectedWorkerKey={state.selectedWorkerKey}
            />
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {state.status === 'running'
            ? 'Arrows select * Enter/Tab expands * Esc/q cancels'
            : (state.result ?? state.error ?? state.status)}
        </Text>
      </Box>
    </Box>
  );
}

function PhaseRail({ state, activePhase }: { state: RunnerState; activePhase: ReviewPhase }): React.ReactNode {
  const activeCount = state.workers.filter(worker => worker.phase === activePhase.id).length;
  return (
    <Box width={18} flexDirection="column" borderRight borderColor="ansi:whiteBright" marginRight={1}>
      <Text>
        Phases{' '}
        <Text dimColor>
          {activePhase.label} * {activeCount} agent{activeCount === 1 ? '' : 's'}
        </Text>
      </Text>
      {PHASES.map((phase, index) => {
        const phaseWorkers = state.workers.filter(worker => worker.phase === phase.id);
        const completed = phaseWorkers.filter(worker => worker.status === 'completed').length;
        const total = phaseWorkers.length;
        const isActive = phase.id === state.activePhase;
        const isSelected = phase.id === state.selectedPhase;
        const done = total > 0 && completed === total;
        return (
          <Text key={phase.id} color={isSelected ? 'permission' : done ? 'success' : 'inactive'}>
            {isSelected ? '> ' : '  '}
            {done ? 'v ' : isActive ? '* ' : '  '}
            {index + 1} {phase.label}
            {total > 0 ? `  ${completed}/${total}` : ''}
          </Text>
        );
      })}
    </Box>
  );
}

function WorkerOverviewPanel({
  state,
  selectedPhase,
  selectedWorkerKey,
}: {
  state: RunnerState;
  selectedPhase: ReviewPhase;
  selectedWorkerKey?: string;
}): React.ReactNode {
  const workers = state.workers.filter(worker => worker.phase === selectedPhase.id);
  const selectedWorker = workers.find(worker => worker.key === selectedWorkerKey);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text>
        {selectedPhase.label} * {workers.length} agent{workers.length === 1 ? '' : 's'}
        {selectedWorker ? <Text dimColor> - {selectedWorker.label}</Text> : null}
      </Text>
      {workers.length === 0 ? (
        <Text dimColor> no verifier agents needed yet</Text>
      ) : (
        workers.map(worker => (
          <WorkerOverviewRow key={worker.key} worker={worker} isSelected={worker.key === selectedWorkerKey} />
        ))
      )}
    </Box>
  );
}

function WorkerOverviewRow({ worker, isSelected }: { worker: ReviewWorker; isSelected: boolean }): React.ReactNode {
  const stats = workerStats(worker);
  return (
    <Box>
      <Box width={28}>
        <Text color={isSelected ? 'permission' : statusColor(worker.status)}>
          {isSelected ? '> ' : '  '}
          {statusGlyph(worker.status)} {worker.label}
        </Text>
      </Box>
      <Box width={24}>
        <Text dimColor wrap="truncate-end">
          {worker.model ?? 'waiting'}
        </Text>
      </Box>
      <Box flexGrow={1} />
      <Text dimColor>{stats}</Text>
    </Box>
  );
}

function WorkerDetailLayout({
  workers,
  selectedPhase,
  selectedWorker,
  now,
}: {
  workers: ReviewWorker[];
  selectedPhase: ReviewPhase;
  selectedWorker: ReviewWorker;
  now: number;
}): React.ReactNode {
  return (
    <>
      <Box width={18} flexDirection="column" borderRight borderColor="ansi:whiteBright" marginRight={1}>
        <Text wrap="truncate-end">
          {selectedPhase.label} * {workers.length} agents - {selectedWorker.label}
        </Text>
        {workers.map(worker => (
          <Text key={worker.key} color={worker.key === selectedWorker.key ? 'permission' : statusColor(worker.status)}>
            {worker.key === selectedWorker.key ? '> ' : '  '}
            {statusGlyph(worker.status)} {worker.label}
          </Text>
        ))}
      </Box>
      <WorkerDetailPanel worker={selectedWorker} now={now} />
    </>
  );
}

function WorkerDetailPanel({ worker, now }: { worker: ReviewWorker; now: number }): React.ReactNode {
  const promptLines = worker.prompt ? worker.prompt.split(/\r?\n/).length : 0;
  const promptPreview = worker.prompt ? firstMeaningfulLines(worker.prompt, 3) : [];
  const elapsed = worker.startedAt ? formatDuration((worker.completedAt ?? now) - worker.startedAt) : undefined;
  const activities = worker.recentActivities?.slice(-4) ?? [];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text>
        <Text color={statusColor(worker.status)}>{statusGlyph(worker.status)} </Text>
        {worker.label}
        {'  '}
        <Text color={statusColor(worker.status)}>{statusLabel(worker.status)}</Text>
        <Text dimColor> * {worker.model ?? 'waiting'}</Text>
      </Text>
      <Text dimColor>
        {worker.tokenCount !== undefined ? `${formatCompact(worker.tokenCount)} tok` : '0 tok'} *{' '}
        {worker.toolUseCount ?? 0} tool calls{elapsed ? ` * ${elapsed}` : ''}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>
          Prompt <Text dimColor>* {promptLines} lines * Enter/Tab collapse</Text>
        </Text>
        {promptPreview.map(line => (
          <Text key={line} dimColor wrap="truncate-end">
            {line}
          </Text>
        ))}
        {promptLines > promptPreview.length ? (
          <Text dimColor>... {promptLines - promptPreview.length} more lines</Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>
          Activity{' '}
          <Text dimColor>
            * last {activities.length} of {worker.toolUseCount ?? activities.length} tool calls
          </Text>
        </Text>
        {activities.length === 0 ? (
          <Text dimColor>
            {worker.status === 'running' ? 'Waiting for first tool call...' : 'No tool activity recorded.'}
          </Text>
        ) : (
          activities.map(activity => (
            <Text key={activityKey(activity)} dimColor wrap="truncate-end">
              {activity.activityDescription ?? activity.toolName}
            </Text>
          ))
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>
          Outcome
        </Text>
        {worker.status === 'running' || worker.status === 'pending' ? (
          <Text dimColor>Still running...</Text>
        ) : worker.status === 'failed' ? (
          <Text color="error" wrap="truncate-end">
            {worker.error ?? 'Worker failed'}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {worker.summary || 'No output captured.'}
          </Text>
        )}
      </Box>
    </Box>
  );
}

async function runCodeReviewWorkflow({
  args,
  context,
  options,
  abortController,
  setState,
}: {
  args: string;
  context: LocalJSXCommandContext;
  options: RunnerOptions;
  abortController: AbortController;
  setState: React.Dispatch<React.SetStateAction<RunnerState>>;
}): Promise<string> {
  if (!context.canUseTool) {
    throw new Error('/code-review requires an interactive tool permission context');
  }

  const agentDefinition = selectReviewAgent(context.options.agentDefinitions.activeAgents);
  const rootSetAppState = context.setAppStateForTasks ?? context.setAppState;
  const workerPermissionContext = {
    ...context.getAppState().toolPermissionContext,
    mode: agentDefinition.permissionMode ?? 'acceptEdits',
  };
  const workerTools = assembleToolPool(workerPermissionContext, context.getAppState().mcp.tools);
  const scope = await runWorker({
    spec: {
      key: 'scope',
      phase: 'scope',
      label: 'scope',
      prompt: buildScopePrompt(args, options),
    },
    context,
    rootSetAppState,
    agentDefinition,
    workerTools,
    options,
    abortController,
    setState,
  });

  const finderSpecs = BASE_FINDERS.map(finder => ({
    key: finder.key,
    phase: 'find' as const,
    label: finder.label,
    prompt: buildFinderPrompt(finder.focus, scope.text, options),
  }));
  setActiveSelection(setState, 'find', finderSpecs[0]?.key);
  const finderResults = await Promise.all(
    finderSpecs.map(spec =>
      runWorker({
        spec,
        context,
        rootSetAppState,
        agentDefinition,
        workerTools,
        options,
        abortController,
        setState,
      }),
    ),
  );

  const findings = extractDistinctFindings(finderResults.map(result => result.text).join('\n\n')).slice(0, 8);
  if (findings.length > 0) {
    setState(prev => ({
      ...prev,
      activePhase: 'verify',
      selectedPhase: 'verify',
      selectedWorkerKey: 'verify-1',
      view: 'overview',
      workers: [
        ...prev.workers,
        ...findings.map((finding, index) => ({
          key: `verify-${index + 1}`,
          phase: 'verify' as const,
          label: `verify-${index + 1}`,
          status: 'pending' as const,
          summary: finding,
        })),
      ],
    }));
    await Promise.all(
      findings.map((finding, index) =>
        runWorker({
          spec: {
            key: `verify-${index + 1}`,
            phase: 'verify',
            label: `verify-${index + 1}`,
            prompt: buildVerifyPrompt(finding, scope.text, options),
          },
          context,
          rootSetAppState,
          agentDefinition,
          workerTools,
          options,
          abortController,
          setState,
        }),
      ),
    );
  }

  setActiveSelection(setState, 'sweep', 'sweep');
  const sweep = await runWorker({
    spec: {
      key: 'sweep',
      phase: 'sweep',
      label: 'sweep',
      prompt: buildSweepPrompt(
        scope.text,
        finderResults.map(result => result.text),
        options,
      ),
    },
    context,
    rootSetAppState,
    agentDefinition,
    workerTools,
    options,
    abortController,
    setState,
  });

  setActiveSelection(setState, 'synthesize', 'synthesize');
  const synthesis = await runWorker({
    spec: {
      key: 'synthesize',
      phase: 'synthesize',
      label: 'synthesize',
      prompt: buildSynthesisPrompt({
        scope: scope.text,
        finders: finderResults.map(result => result.text),
        findings,
        sweep: sweep.text,
        options,
      }),
    },
    context,
    rootSetAppState,
    agentDefinition,
    workerTools,
    options,
    abortController,
    setState,
  });

  return synthesis.text.trim() || 'code-review completed with no synthesized output';
}

async function runWorker({
  spec,
  context,
  rootSetAppState,
  agentDefinition,
  workerTools,
  options,
  abortController,
  setState,
}: {
  spec: WorkerSpec;
  context: LocalJSXCommandContext;
  rootSetAppState: LocalJSXCommandContext['setAppState'];
  agentDefinition: AgentDefinition;
  workerTools: ReturnType<typeof assembleToolPool>;
  options: RunnerOptions;
  abortController: AbortController;
  setState: React.Dispatch<React.SetStateAction<RunnerState>>;
}): Promise<{ taskId: string; text: string }> {
  if (abortController.signal.aborted) {
    throw new Error('cancelled');
  }

  const startedAt = Date.now();
  const agentId = createAgentId(`code-review-${spec.key}`);
  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    context.options.mainLoopModel,
    options.modelOverride as ModelAlias | undefined,
    context.getAppState().toolPermissionContext.mode,
  );
  const promptMessages: Message[] = [
    createUserMessage({
      content: spec.prompt,
    }) as unknown as Message,
  ];
  const task = registerAsyncAgent({
    agentId,
    description: `code-review ${spec.label}`,
    prompt: spec.prompt,
    selectedAgent: agentDefinition,
    setAppState: rootSetAppState,
    parentAbortController: abortController,
    toolUseId: context.toolUseId,
  });

  setState(prev => ({
    ...prev,
    selectedPhase:
      prev.selectedPhase === prev.activePhase || prev.selectedWorkerKey === undefined ? spec.phase : prev.selectedPhase,
    selectedWorkerKey:
      prev.selectedPhase === prev.activePhase || prev.selectedWorkerKey === undefined
        ? spec.key
        : prev.selectedWorkerKey,
    workers: prev.workers.map(worker =>
      worker.key === spec.key
        ? {
            ...worker,
            status: 'running',
            taskId: task.agentId,
            model: resolvedAgentModel,
            prompt: spec.prompt,
            startedAt,
          }
        : worker,
    ),
  }));

  try {
    await runAsyncAgentLifecycle({
      taskId: task.agentId,
      abortController: task.abortController!,
      makeStream: onCacheSafeParams =>
        runAgent({
          agentDefinition,
          promptMessages,
          toolUseContext: context,
          canUseTool: context.canUseTool!,
          isAsync: true,
          querySource: context.options.querySource ?? 'code-review',
          model: options.modelOverride as ModelAlias | undefined,
          availableTools: workerTools,
          override: {
            agentId: asAgentId(task.agentId),
            abortController: task.abortController!,
          },
          description: `code-review ${spec.label}`,
          transcriptSubdir: `workflows/code-review`,
          onCacheSafeParams,
        }),
      metadata: {
        prompt: spec.prompt,
        resolvedAgentModel,
        isBuiltInAgent: isBuiltInAgent(agentDefinition),
        startTime: startedAt,
        agentType: agentDefinition.agentType,
        isAsync: true,
      },
      description: `code-review ${spec.label}`,
      toolUseContext: context,
      rootSetAppState,
      agentIdForCleanup: task.agentId,
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState(prev => ({
      ...prev,
      workers: prev.workers.map(worker =>
        worker.key === spec.key
          ? {
              ...worker,
              status: abortController.signal.aborted ? 'cancelled' : 'failed',
              error: message,
              completedAt: Date.now(),
            }
          : worker,
      ),
    }));
    throw error;
  }

  const latestTask = context.getAppState().tasks[task.agentId];
  const result = latestTask && 'result' in latestTask ? latestTask.result : undefined;
  const text =
    result && typeof result === 'object' && 'content' in result ? extractTextContent(result.content, '\n') : '';
  const tokenCount = result && typeof result === 'object' && 'totalTokens' in result ? result.totalTokens : undefined;
  const toolUseCount =
    result && typeof result === 'object' && 'totalToolUseCount' in result ? result.totalToolUseCount : undefined;

  setState(prev => ({
    ...prev,
    workers: prev.workers.map(worker =>
      worker.key === spec.key
        ? {
            ...worker,
            status: 'completed',
            summary: text.slice(0, 240),
            tokenCount: typeof tokenCount === 'number' ? tokenCount : worker.tokenCount,
            toolUseCount: typeof toolUseCount === 'number' ? toolUseCount : worker.toolUseCount,
            completedAt: Date.now(),
          }
        : worker,
    ),
  }));

  return { taskId: task.agentId, text };
}

function selectReviewAgent(activeAgents: AgentDefinition[]): AgentDefinition {
  return activeAgents.find(agent => agent.agentType === 'general-purpose') ?? GENERAL_PURPOSE_AGENT;
}

function buildScopePrompt(args: string, options: RunnerOptions): string {
  return `You are the Scope worker for a deterministic /code-review workflow.

Inputs: ${args || '(no extra args)'}
Effort: ${options.effort}
Mode: ${options.shouldFix ? 'review with fix intent, but do not edit files in this worker' : 'review only'}

Task:
1. Inspect git status and git diff for the current repository.
2. Identify changed files, risky areas, and likely test/lint commands.
3. Do not modify files.
4. Return a concise scope report with changed files and review angles.`;
}

function buildFinderPrompt(focus: string, scope: string, options: RunnerOptions): string {
  return `You are a Finder worker in a deterministic /code-review workflow.

Focus: ${focus}
Effort: ${options.effort}

Scope report:
${scope}

Rules:
- Read and analyze only. Do not modify files.
- Prioritize concrete bugs over style.
- Report findings in this exact shape when possible:
  FINDING: path/to/file:line - severity - concise issue
  EVIDENCE: why this is a real issue
  FIX: concise recommended change
- If no issue is found for your focus, say "No findings for this angle."`;
}

function buildVerifyPrompt(finding: string, scope: string, options: RunnerOptions): string {
  return `You are an independent Verifier worker in a deterministic /code-review workflow.

Candidate finding:
${finding}

Scope report:
${scope}

Effort: ${options.effort}

Task:
- Re-read the relevant code and verify whether the candidate is real.
- Do not modify files.
- Output exactly one of:
  VERIFIED: path:line - severity - reason
  REJECTED: path:line - reason
  NEEDS_MORE_CONTEXT: path:line - reason`;
}

function buildSweepPrompt(scope: string, finderOutputs: string[], options: RunnerOptions): string {
  return `You are the Sweep worker in a deterministic /code-review workflow.

Scope report:
${scope}

Finder outputs:
${finderOutputs.join('\n\n---\n\n')}

Effort: ${options.effort}

Task:
- Look for duplicated, stale, cleanup-only, or missed low-risk issues across the changed files.
- Do not modify files.
- Return only additional findings or "No cleanup findings."`;
}

function buildSynthesisPrompt({
  scope,
  finders,
  findings,
  sweep,
  options,
}: {
  scope: string;
  finders: string[];
  findings: string[];
  sweep: string;
  options: RunnerOptions;
}): string {
  return `You are the Synthesizer worker for a deterministic /code-review workflow.

Effort: ${options.effort}
Fix intent: ${options.shouldFix ? 'yes' : 'no'}

Scope:
${scope}

Finder outputs:
${finders.join('\n\n---\n\n')}

Verifier candidates:
${findings.length > 0 ? findings.join('\n') : '(none)'}

Sweep:
${sweep}

Task:
- Produce the final code review response.
- Findings first, ordered by severity.
- Include file:line references.
- Keep it concise.
- If no verified issues remain, say no issues found and mention test gaps.`;
}

function extractDistinctFindings(text: string): string[] {
  const findings = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    const match = normalized.match(
      /(?:FINDING:\s*)?([A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|json|md|mjs|cjs)):(\d+)\b.*$/,
    );
    if (!match) continue;
    const key = `${match[1]}:${match[2]}`.replace(/\\/g, '/');
    if (!findings.has(key)) {
      findings.set(key, normalized);
    }
  }
  return Array.from(findings.values());
}

function statusGlyph(status: AgentStatus): string {
  switch (status) {
    case 'completed':
      return 'v';
    case 'running':
      return '*';
    case 'failed':
      return 'x';
    case 'cancelled':
      return '-';
    case 'pending':
      return '.';
  }
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'running':
      return 'Running';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
      return 'Pending';
  }
}

function statusColor(status: AgentStatus): 'ansi:cyan' | 'success' | 'error' | 'inactive' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'ansi:cyan';
    case 'failed':
      return 'error';
    case 'cancelled':
    case 'pending':
      return 'inactive';
  }
}

function formatCompact(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

function workerStats(worker: ReviewWorker): string {
  const parts: string[] = [];
  if (worker.toolUseCount !== undefined) {
    parts.push(`${worker.toolUseCount} tool use${worker.toolUseCount === 1 ? '' : 's'}`);
  }
  if (worker.tokenCount !== undefined && worker.tokenCount > 0) {
    parts.push(`${formatCompact(worker.tokenCount)} tokens`);
  }
  return parts.join(' * ');
}

function hydrateWorkersFromTasks(state: RunnerState, context: LocalJSXCommandContext): RunnerState {
  const tasks = context.getAppState().tasks;
  let changed = false;
  const workers = state.workers.map(worker => {
    if (!worker.taskId) return worker;
    const task = tasks[worker.taskId];
    if (!isLocalAgentTask(task)) return worker;
    const nextTokenCount = task.result?.totalTokens ?? task.progress?.tokenCount ?? worker.tokenCount;
    const nextToolUseCount = task.result?.totalToolUseCount ?? task.progress?.toolUseCount ?? worker.toolUseCount;
    const nextRecentActivities = task.progress?.recentActivities ?? worker.recentActivities;
    const nextModel = task.model ?? worker.model;
    if (
      nextTokenCount === worker.tokenCount &&
      nextToolUseCount === worker.toolUseCount &&
      nextRecentActivities === worker.recentActivities &&
      nextModel === worker.model
    ) {
      return worker;
    }
    changed = true;
    return {
      ...worker,
      tokenCount: nextTokenCount,
      toolUseCount: nextToolUseCount,
      recentActivities: nextRecentActivities,
      model: nextModel,
    };
  });
  return changed ? { ...state, workers } : state;
}

function setActiveSelection(
  setState: React.Dispatch<React.SetStateAction<RunnerState>>,
  phase: PhaseId,
  selectedWorkerKey?: string,
): void {
  setState(prev => ({
    ...prev,
    activePhase: phase,
    selectedPhase: phase,
    selectedWorkerKey: selectedWorkerKey ?? firstWorkerKey(prev.workers, phase) ?? prev.selectedWorkerKey,
    view: 'overview',
  }));
}

function firstWorkerKey(workers: ReviewWorker[], phase: PhaseId): string | undefined {
  return workers.find(worker => worker.phase === phase)?.key;
}

function selectAdjacentPhase(state: RunnerState, delta: -1 | 1): RunnerState {
  const currentIndex = Math.max(
    0,
    PHASES.findIndex(phase => phase.id === state.selectedPhase),
  );
  const nextIndex = Math.min(PHASES.length - 1, Math.max(0, currentIndex + delta));
  const selectedPhase = PHASES[nextIndex]!.id;
  return {
    ...state,
    selectedPhase,
    selectedWorkerKey: firstWorkerKey(state.workers, selectedPhase) ?? state.selectedWorkerKey,
  };
}

function selectAdjacentWorker(state: RunnerState, delta: -1 | 1): RunnerState {
  const workers = state.workers.filter(worker => worker.phase === state.selectedPhase);
  if (workers.length === 0) return state;
  const currentIndex = Math.max(
    0,
    workers.findIndex(worker => worker.key === state.selectedWorkerKey),
  );
  const nextIndex = Math.min(workers.length - 1, Math.max(0, currentIndex + delta));
  return { ...state, selectedWorkerKey: workers[nextIndex]!.key };
}

function firstMeaningfulLines(prompt: string, maxLines: number): string[] {
  return prompt
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
    .slice(0, maxLines);
}

function activityKey(activity: ToolActivity): string {
  return `${activity.toolName}:${activity.activityDescription ?? JSON.stringify(activity.input)}`;
}
