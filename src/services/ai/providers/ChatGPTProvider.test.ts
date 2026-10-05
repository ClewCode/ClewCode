import { expect, test } from 'bun:test';
import { getAdapter } from '../adapter/AnthropicAdapter.js';
import './ChatGPTProvider.js';

test('omits temperature from Responses API requests', async () => {
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

test('forwards output and reasoning budgets to Responses API', async () => {
  let captured: Record<string, unknown> | undefined;
  const client = {
    responses: {
      create: async (params: Record<string, unknown>) => {
        captured = params;
        return { id: 'response-test', model: params.model, output: [], usage: { input_tokens: 0, output_tokens: 0 } };
      },
    },
  };
  const createAdapter = getAdapter('chatgpt');
  expect(createAdapter).toBeDefined();
  const adapter = createAdapter!(client, 'chatgpt');

  await adapter.createMessage({
    model: 'gpt-5.6-sol',
    max_tokens: 1234,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'hello' }],
  } as any);

  expect(captured).toMatchObject({ max_output_tokens: 1234, reasoning: { effort: 'low' } });
});

test('throws errors reported inside a ChatGPT response stream', async () => {
  const { getAdapter } = await import('../adapter/AnthropicAdapter.js');
  await import('./ChatGPTProvider.js');
  const client = {
    responses: {
      create: async () =>
        (async function* () {
          yield {
            type: 'response.failed',
            response: { error: { code: 'model_not_found', message: 'Model is not available for this account' } },
          };
        })(),
    },
  };
  const createAdapter = getAdapter('chatgpt');
  expect(createAdapter).toBeDefined();
  const adapter = createAdapter!(client, 'chatgpt');
  const stream = await adapter.streamMessage({
    model: 'gpt-5.6-sol',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hello' }],
  });

  await expect(
    (async () => {
      for await (const _event of stream) {
        // Consume the stream so an in-band failure is observed.
      }
    })(),
  ).rejects.toThrow('Model is not available for this account');
});

test('streams reasoning deltas through one thinking block until reasoning is complete', async () => {
  const { getAdapter } = await import('../adapter/AnthropicAdapter.js');
  await import('./ChatGPTProvider.js');
  const client = {
    responses: {
      create: async () =>
        (async function* () {
          yield { type: 'response.reasoning_summary_text.delta', delta: 'Inspecting ' };
          yield { type: 'response.reasoning_summary_text.delta', delta: 'the request' };
          yield { type: 'response.output_item.done', item: { type: 'reasoning' } };
          yield { type: 'response.output_text.delta', delta: 'Done' };
          yield { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 4 } } };
        })(),
    },
  };
  const createAdapter = getAdapter('chatgpt');
  expect(createAdapter).toBeDefined();
  const adapter = createAdapter!(client, 'chatgpt');
  const stream = await adapter.streamMessage({
    model: 'gpt-5.6-sol',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hello' }],
  });
  const events: any[] = [];

  for await (const event of stream) events.push(event);

  const contentEvents = events.filter(event => event.type.startsWith('content_block_'));
  expect(contentEvents).toEqual([
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Inspecting ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'the request' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done' } },
    { type: 'content_block_stop', index: 1 },
  ]);
});

test('normalizes Responses cached input tokens without double-counting them', async () => {
  const client = {
    responses: {
      create: async () => ({
        id: 'response-cache-test',
        model: 'gpt-5.6-sol',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done' }] }],
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 800 },
          output_tokens: 20,
        },
      }),
    },
  };
  const createAdapter = getAdapter('chatgpt');
  expect(createAdapter).toBeDefined();
  const adapter = createAdapter!(client, 'chatgpt');

  const message = await adapter.createMessage({
    model: 'gpt-5.6-sol',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'hello' }],
  });

  expect(message.usage).toMatchObject({
    input_tokens: 200,
    cache_read_input_tokens: 800,
    output_tokens: 20,
  });
});
