import { getSessionId } from '../../bootstrap/state.js';
import { getSystemPrompt } from '../../constants/prompts.js';
import { getSystemContext, getUserContext } from '../../context.js';
import { startBackgroundSession } from '../../tasks/LocalMainSessionTask.js';
import type { LocalCommandCall } from '../../types/command.js';
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js';
import { buildEffectiveSystemPrompt } from '../../utils/systemPrompt.js';

export const call: LocalCommandCall = async (_args, context) => {
  const { messages } = context;

  if (messages.length === 0) {
    throw new Error('No messages to background');
  }

  const appState = context.getAppState();
  const defaultSysPrompt = await getSystemPrompt(
    context.options.tools,
    context.options.mainLoopModel,
    Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys()),
    context.options.mcpClients,
  );

  const systemPrompt = buildEffectiveSystemPrompt({
    mainThreadAgentDefinition: undefined,
    toolUseContext: context,
    customSystemPrompt: context.options.customSystemPrompt,
    defaultSystemPrompt: defaultSysPrompt,
    appendSystemPrompt: context.options.appendSystemPrompt,
  });

  const [userContext, systemContext] = await Promise.all([getUserContext(), getSystemContext()]);

  const title = getCurrentSessionTitle(getSessionId()) || 'Background session';

  // Start the background session
  const taskId = startBackgroundSession({
    messages,
    queryParams: {
      systemPrompt,
      userContext,
      systemContext,
      canUseTool: context.canUseTool,
      toolUseContext: context,
      querySource: context.options.querySource ?? 'bg',
    },
    description: title,
    setAppState: context.setAppState,
    agentDefinition: undefined,
  });

  // Notify the user
  context.addNotification?.({
    key: `bg-started-${taskId}`,
    text: `Background session started with ID: ${taskId}`,
    priority: 'high',
  });

  // Clear messages in the active foreground REPL so it returns to a fresh prompt
  context.setMessages(() => []);

  return {
    type: 'skip',
  };
};
