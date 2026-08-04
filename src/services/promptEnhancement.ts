import { asSystemPrompt } from '../utils/systemPromptType.js';
import { getMainLoopModel } from '../utils/model/model.js';
import { queryWithModel } from './api/claude.js';

const ENHANCEMENT_SYSTEM_PROMPT = `You are a prompt enhancement specialist. Your job is to improve user prompts to make them clearer, more specific, and more actionable.

When given a prompt, enhance it by:
1. Making it more specific and detailed
2. Adding relevant context that would help get better results
3. Clarifying the intent and desired outcome
4. Structuring it for clarity
5. Adding constraints or requirements if needed

Return ONLY the enhanced prompt text, without any explanation or preamble.`;

export async function enhancePrompt(prompt: string, signal: AbortSignal): Promise<string> {
  const model = getMainLoopModel();
  if (!model) {
    throw new Error('No model available for prompt enhancement');
  }

  const result = await queryWithModel({
    systemPrompt: asSystemPrompt([ENHANCEMENT_SYSTEM_PROMPT]),
    userPrompt: prompt,
    signal,
    options: {
      model,
      requestStartFn: () => undefined,
      onRequestComplete: () => undefined,
    } as any,
  });

  if (result.type === 'assistant') {
    for (const block of result.message.content) {
      if (block.type === 'text') {
        return block.text.trim();
      }
    }
  }

  throw new Error('Failed to enhance prompt');
}
