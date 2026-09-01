import { describe, expect, test } from 'bun:test';
import { findOpenRouterCapabilities, parseOpenRouterCapabilityCatalog } from './openRouterCapabilities.js';

describe('OpenRouter capability fallback', () => {
  const catalog = parseOpenRouterCapabilityCatalog({
    data: [
      {
        id: 'anthropic/claude-opus-4.7',
        name: 'Claude Opus 4.7',
        context_length: 1_000_000,
        architecture: { input_modalities: ['text', 'image'] },
        supported_parameters: ['tools', 'reasoning'],
        top_provider: { max_completion_tokens: 128_000 },
      },
    ],
  });

  test('parses context and factual capability fields', () => {
    expect(catalog[0]).toEqual({
      id: 'anthropic/claude-opus-4.7',
      label: 'Claude Opus 4.7',
      contextWindow: 1_000_000,
      supportsVision: true,
      supportsTools: true,
      supportsReasoning: true,
      maxOutput: 128_000,
    });
  });

  test('matches provider-native ids despite dotted versus dashed versions', () => {
    expect(findOpenRouterCapabilities('claude-opus-4-7', catalog)?.id).toBe('anthropic/claude-opus-4.7');
  });

  test('keeps absent OpenRouter fields unknown instead of treating them as unsupported', () => {
    expect(parseOpenRouterCapabilityCatalog({ data: [{ id: 'vendor/model' }] })[0]).toMatchObject({
      supportsVision: undefined,
      supportsTools: undefined,
      supportsReasoning: undefined,
    });
  });
});
