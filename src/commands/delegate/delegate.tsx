import ansis from 'ansis';
import { registerAsyncAgent } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { runAsyncAgentLifecycle } from '../../tools/AgentTool/agentToolUtils.js';
import { RLM_AGENT } from '../../tools/AgentTool/built-in/rlmAgent.js';
import { isBuiltInAgent } from '../../tools/AgentTool/loadAgentsDir.js';
import { runAgent } from '../../tools/AgentTool/runAgent.js';
import { assembleToolPool } from '../../tools.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { asAgentId } from '../../types/ids.js';
import type { Message } from '../../types/message.js';
import type { CacheSafeParams } from '../../utils/forkedAgent.js';
import { createUserMessage, extractTextContent } from '../../utils/messages.js';
import { getAgentModel } from '../../utils/model/agent.js';
import type { ModelAlias } from '../../utils/model/aliases.js';
import { createAgentId } from '../../utils/uuid.js';

/** Default agent type when /delegate is called without an agent argument. */
const DEFAULT_DELEGATE_AGENT = RLM_AGENT.agentType;

/** Run one agent synchronously and return the final assistant text. */
async function runDelegatedAgent({
  prompt,
  agentType,
  context,
  onDone,
}: {
  prompt: string;
  agentType: string;
  context: LocalJSXCommandContext;
  onDone: LocalJSXCommandOnDone;
}): Promise<void> {
  if (!context.canUseTool) {
    onDone('/delegate requires an interactive tool permission context.');
    return;
  }

  const activeAgents = context.options.agentDefinitions.activeAgents;
  const agentDefinition = activeAgents.find(a => a.agentType === agentType) ?? RLM_AGENT;
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
  const abortController = new AbortController();
  const task = registerAsyncAgent({
    agentId: asAgentId(agentId),
    description: `delegate ${agentType}`,
    prompt,
    selectedAgent: agentDefinition,
    setAppState: rootSetAppState,
    parentAbortController: abortController,
    toolUseId: context.toolUseId,
  });

  try {
    await runAsyncAgentLifecycle({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onDone(`/delegate ${agentType} failed: ${message}`);
    return;
  }

  const latestTask = context.getAppState().tasks[task.agentId];
  const result = latestTask && 'result' in latestTask ? latestTask.result : undefined;
  const text =
    result && typeof result === 'object' && 'content' in result
      ? extractTextContent(result.content, '\n')
      : 'delegate completed with no text result.';
  onDone(text.trim());
}

export const call: LocalJSXCommandCall = async (onDone, context, rawArgs = '') => {
  const args = rawArgs.trim();
  if (!args) {
    onDone(
      `${ansis.bold('/delegate <agent-type> <prompt>')} — run one subagent synchronously and show its result.\n\n` +
        `A leading token that names a registered agent becomes the agent type (default ${DEFAULT_DELEGATE_AGENT}); ` +
        'everything after it is the delegated prompt. For example: /delegate "survey the provider fallback chain and report the failure paths"',
    );
    return;
  }

  // Split "type prompt" on the first space; an unrecognized first token is
  // treated as part of the prompt for the default agent so a bare message works.
  const firstSpace = args.indexOf(' ');
  const maybeType = firstSpace === -1 ? args : args.slice(0, firstSpace);
  const rest = firstSpace === -1 ? '' : args.slice(firstSpace + 1).trim();
  const known = context?.options?.agentDefinitions?.activeAgents?.some(a => a.agentType === maybeType) ?? false;

  const { agentType, prompt } =
    known && rest ? { agentType: maybeType, prompt: rest } : { agentType: DEFAULT_DELEGATE_AGENT, prompt: args };

  await runDelegatedAgent({ prompt, agentType, context, onDone });
};
