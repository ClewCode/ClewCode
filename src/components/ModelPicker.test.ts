import { describe, expect, test } from 'bun:test';
import { buildUnifiedModelOptions, formatModelContext, formatModelRate, getPriceMarkerIndex } from './ModelPicker.js';

describe('buildUnifiedModelOptions', () => {
  test('lists every provider in one grouped list', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'anthropic', initial: null });

    const sections = options.filter(opt => opt.type === 'section').map(opt => opt.label);
    expect(sections).toContain('Anthropic');
    expect(sections).toContain('OpenAI (API Key)');
    expect(sections).toContain('Google');

    const models = options.filter(opt => opt.modelId);
    expect(models.length).toBeGreaterThan(50);
  });

  test('puts the active provider first', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'xai', initial: null });
    const firstSection = options.find(opt => opt.type === 'section' && opt.label !== 'Recent');
    expect(firstSection?.label).toBe('xAI');
  });

  test('keys rows by provider so same-id models across providers stay distinct', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'anthropic', initial: null });
    const values = options.map(opt => opt.value);
    expect(new Set(values).size).toBe(values.length);

    const claude = options.find(opt => opt.providerId === 'anthropic' && opt.modelId);
    expect(claude?.value).toBe(`anthropic/${claude?.modelId}`);
  });

  test('always offers the default and custom-id rows', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'anthropic', initial: null });
    expect(options.some(opt => opt.value === '__NO_PREFERENCE__')).toBe(true);
    expect(options.at(-1)?.value).toBe('__CUSTOM_INPUT__');
  });

  test('marks provider model ids with a free suffix as free', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'anthropic', initial: null });
    const freeModel = options.find(
      opt => !opt.type && opt.description !== 'Recently used' && opt.modelId?.endsWith(':free'),
    );

    expect(freeModel).toBeDefined();
    expect(freeModel?.description.toLowerCase()).toContain('free');
  });

  test('includes live models fetched for non-active providers', () => {
    const options = buildUnifiedModelOptions({
      activeProviderId: 'anthropic',
      initial: null,
      fetchedModelsByProvider: {
        openai: [{ id: 'new-model-2026', label: 'New Model 2026' }],
      },
    });

    expect(options.some(opt => opt.providerId === 'openai' && opt.modelId === 'new-model-2026')).toBe(true);
  });

  test('carries factual context, vision, tools, and reasoning metadata into model rows', () => {
    const options = buildUnifiedModelOptions({ activeProviderId: 'anthropic', initial: null });
    const opus = options.find(option => option.providerId === 'anthropic' && option.modelId === 'claude-opus-4-8');

    expect(opus?.capabilities).toEqual({ context: 1_000_000, vision: true, tools: true, reasoning: true });
    expect(formatModelContext(opus?.capabilities?.context)).toBe('1M');
    expect(formatModelContext('varies')).toBe('varies');
    expect(formatModelContext(undefined)).toBe('?');
  });

  test('backfills registry capabilities when a live model listing only returns an id', () => {
    const options = buildUnifiedModelOptions({
      activeProviderId: 'openai',
      initial: null,
      fetchedModels: [{ id: 'gpt-5.5', label: 'GPT-5.5 live' }],
    });
    const model = options.find(option => option.providerId === 'openai' && option.modelId === 'gpt-5.5');

    expect(model?.capabilities).toEqual({ context: 1_000_000, vision: true, tools: true, reasoning: true });
  });

  test('formats model pricing and places premium models farther along the spectrum', () => {
    expect(formatModelRate(0.12)).toBe('$0.12 / 1M');
    expect(formatModelRate(0)).toBe('$0 / 1M');
    expect(getPriceMarkerIndex(0, 24)).toBe(0);
    expect(getPriceMarkerIndex(15, 24)).toBeGreaterThan(getPriceMarkerIndex(1, 24));
  });
});
