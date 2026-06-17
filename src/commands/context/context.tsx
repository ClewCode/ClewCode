import { ContextStats } from '../../components/ContextStats.js';
import { Box } from '../../ink.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import type { Message } from '../../types/message.js';
import { collectContextData } from './context-noninteractive.js';

export const call: LocalJSXCommandCall = async (onDone, context, _args) => {
  const messages: Message[] = (context as any).messages ?? context.getAppState().messages ?? [];

  const contextData = await collectContextData({
    messages,
    getAppState: context.getAppState,
    options: {
      mainLoopModel: context.options.mainLoopModel,
      tools: context.options.tools,
      agentDefinitions: context.options.agentDefinitions,
      customSystemPrompt: context.options.customSystemPrompt,
      appendSystemPrompt: context.options.appendSystemPrompt,
    },
  });

  return (
    <Box>
      <ContextStats data={contextData} onClose={onDone} />
    </Box>
  );
};
