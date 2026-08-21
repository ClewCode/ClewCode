import ansis from 'ansis';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { killAsyncAgent, registerAsyncAgent } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { runAsyncAgentLifecycle } from '../../tools/AgentTool/agentToolUtils.js';
import { GENERAL_PURPOSE_AGENT } from '../../tools/AgentTool/built-in/generalPurposeAgent.js';
import type { AgentDefinition } from '../../tools/AgentTool/loadAgentsDir.js';
import { isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js';
import { runAgent } from '../../tools/AgentTool/runAgent.js';
import { assembleToolPool } from '../../tools.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { asAgentId } from '../../types/ids.js';
import type { Message } from '../../types/message.js';
import type { CacheSafeParams } from '../../utils/forkedAgent.js';
import { formatDuration } from '../../utils/format.js';
import { createUserMessage, extractTextContent } from '../../utils/messages.js';
import { getAgentModel } from '../../utils/model/agent.js';
import type { ModelAlias } from '../../utils/model/aliases.js';
import { createAgentId } from '../../utils/uuid.js';

/** Default agent type when /delegate is called without an agent argument. */
const DEFAULT_DELEGATE_AGENT = GENERAL_PURPOSE_AGENT.agentType;

/**
 * DelegateRunner — live UI while the delegated agent runs.
 *
 * Rendering a component (rather than awaiting then calling onDone) is what
 * gives /delegate a visible panel: the previous implementation sat silent
 * until the agent finished. Progress is streamed into AppState.tasks[agentId]
 * by the lifecycle, so the component just subscribes and paints. Esc/q aborts.
 */
type DelegateRunnerProps = {
  agentType: string;
  agentDefinition: AgentDefinition;
  prompt: string;
  context: LocalJSXCommandContext;
  onDone: LocalJSXCommandOnDone;
};

function DelegateRunner({ agentType, agentDefinition, prompt, context, onDone }: DelegateRunnerProps): React.ReactNode {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);

  // Live task state — progress is updated by the lifecycle on every message.
  const task = useAppState(s => (agentId ? s.tasks[agentId] : undefined));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input.toLowerCase() === 'c')) {
      if (agentId) {
        killAsyncAgent(agentId, context.setAppStateForTasks ?? context.setAppState);
      }
    }
  });

  useEffect(() => {
    const rootSetAppState = context.setAppStateForTasks ?? context.setAppState;
    const workerPermissionContext = {
      ...context.getAppState().toolPermissionContext,
      mode: agentDefinition.permissionMode ?? 'acceptEdits',
    };
    const workerTools = assembleToolPool(workerPermissionContext, context.getAppState().mcp.tools);

    const agentId = createAgentId(`delegate-${agentType}`);
    const resolvedAgentModel = getAgentModel(
      agentDefinition.model,
      context.options.mainLoopModel,
      undefined as ModelAlias | undefined,
      context.getAppState().toolPermissionContext.mode,
    );
    const promptMessages: Message[] = [
      createUserMessage({
        content: prompt,
      }) as unknown as Message,
    ];
    const task = registerAsyncAgent({
      agentId: asAgentId(agentId),
      description: `delegate ${agentType}`,
      prompt,
      selectedAgent: agentDefinition,
      setAppState: rootSetAppState,
      toolUseId: context.toolUseId,
    });
    setAgentId(task.agentId);

    void runAsyncAgentLifecycle({
      taskId: task.agentId,
      abortController: task.abortController!,
      makeStream: (onCacheSafeParams: ((p: CacheSafeParams) => void) | undefined) =>
        runAgent({
          agentDefinition,
          promptMessages,
          toolUseContext: context,
          canUseTool: context.canUseTool!,
          isAsync: false,
          querySource: context.options.querySource ?? 'delegate',
          model: resolvedAgentModel as ModelAlias | undefined,
          availableTools: workerTools,
          override: {
            agentId: asAgentId(task.agentId),
            abortController: task.abortController!,
          },
          description: `delegate ${agentType}`,
          onCacheSafeParams,
        }),
      metadata: {
        prompt,
        resolvedAgentModel,
        isBuiltInAgent: isBuiltInAgent(agentDefinition),
        startTime: Date.now(),
        agentType: agentDefinition.agentType,
        isAsync: false,
      },
      description: `delegate ${agentType}`,
      toolUseContext: context,
      rootSetAppState,
      agentIdForCleanup: task.agentId,
      enableSummarization: true,
      getWorktreeResult: async () => ({}),
    }).then(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      const latest = context.getAppState().tasks[task.agentId];
      if (latest?.status === 'killed') {
        onDone('delegate cancelled.', { display: 'system' });
        return;
      }
      const result = latest && 'result' in latest ? latest.result : undefined;
      const text =
        result && typeof result === 'object' && 'content' in result
          ? extractTextContent(result.content, '\n')
          : 'delegate completed with no text result.';
      onDone(text.trim(), { display: 'system' });
    });
  }, [agentType, agentDefinition, prompt, context, onDone]);

  // Tick the elapsed clock once per second.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const startedAt = task?.startTime;
  const elapsed = startedAt ? formatDuration(now - startedAt) : '';
  const progress = task?.progress;
  const lastActivity = progress?.lastActivity?.activityDescription ?? progress?.lastActivity?.toolName;

  const status = task
    ? task.status === 'failed'
      ? `failed: ${task.error ?? 'unknown error'}`
      : task.status
    : 'starting';
  const running = status === 'running' || status === 'starting';

  return (
    <Box flexDirection="column" borderTop borderColor="ansi:whiteBright" paddingTop={1}>
      <Text color="permission">delegate · {agentType}</Text>
      <Text dimColor wrap="truncate-end">
        {prompt}
      </Text>
      <Box marginTop={1}>
        <Text color={running ? 'green' : undefined}>
          {running ? '⟳' : status === 'completed' ? '✓' : '✗'} {status}
        </Text>
        {elapsed && <Text dimColor> · {elapsed}</Text>}
        {progress && (
          <Text dimColor>
            {' '}
            · {progress.toolUseCount} tools · {progress.tokenCount.toLocaleString()} tokens
          </Text>
        )}
        {lastActivity && <Text dimColor> · {lastActivity}</Text>}
      </Box>
      {running && <Text dimColor>Esc/q to cancel</Text>}
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, context, rawArgs = '') => {
  const args = rawArgs.trim();
  if (!args) {
    onDone(
      `${ansis.bold('/delegate <agent-type> <prompt>')} — run one subagent synchronously and show its result.\n\n` +
        `A leading token that names a registered agent becomes the agent type (default ${DEFAULT_DELEGATE_AGENT}); ` +
        'everything after it is the delegated prompt. For example: /delegate "survey the provider fallback chain and report the failure paths"',
    );
    return undefined;
  }

  // Split "type prompt" on the first space; an unrecognized first token is
  // treated as part of the prompt for the default agent so a bare message works.
  const firstSpace = args.indexOf(' ');
  const maybeType = firstSpace === -1 ? args : args.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : args.slice(firstSpace + 1).trim();
  const activeAgents = context?.options?.agentDefinitions?.activeAgents ?? [];
  const known = activeAgents.some(a => a.agentType === maybeType);

  const { agentType, prompt } =
    known && rest ? { agentType: maybeType, prompt: rest } : { agentType: DEFAULT_DELEGATE_AGENT, prompt: args };

  const agentDefinition = activeAgents.find(a => a.agentType === agentType) ?? RLM_AGENT;
  return (
    <DelegateRunner
      agentType={agentType}
      agentDefinition={agentDefinition}
      prompt={prompt}
      context={context}
      onDone={onDone}
    />
  );
};
