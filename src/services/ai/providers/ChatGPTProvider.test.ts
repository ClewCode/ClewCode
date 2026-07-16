import { expect, test } from 'bun:test';

test('omits temperature from Responses API requests', async () => {
  const { getAdapter } = await import('../adapter/AnthropicAdapter.js');
  await import('./ChatGPTProvider.js');
  let captured: Record<string, unknown> | undefined;
  const client = {
    responses: {
      create: async (params: Record<string, unknown>) => {
        captured = params;
        return {
          id: 'response-test',
          model: params.model,
          output: [],
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      },
    },
  };
  const createAdapter = getAdapter('chatgpt');
  expect(createAdapter).toBeDefined();
  const adapter = createAdapter!(client, 'chatgpt');

  await adapter.createMessage({
    model: 'gpt-5.6-sol',
    max_tokens: 16,
    temperature: 1,
    messages: [{ role: 'user', content: 'hello' }],
  });

  expect(captured).not.toHaveProperty('temperature');
});
