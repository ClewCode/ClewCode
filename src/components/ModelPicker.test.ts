import { describe, expect, test } from 'bun:test';
import { buildUnifiedModelOptions } from './ModelPicker.js';

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
});
