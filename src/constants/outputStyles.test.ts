import { describe, expect, it } from 'bun:test';
import { DEFAULT_OUTPUT_STYLE_NAME, getAllOutputStyles, OUTPUT_STYLE_CONFIG } from './outputStyles.js';

describe('outputStyles', () => {
  it('includes default built-in output styles', () => {
    expect(OUTPUT_STYLE_CONFIG[DEFAULT_OUTPUT_STYLE_NAME]).toBeNull();
    expect(OUTPUT_STYLE_CONFIG.Concise).toBeDefined();
    expect(OUTPUT_STYLE_CONFIG.Concise?.name).toBe('Concise');
    expect(OUTPUT_STYLE_CONFIG.Explanatory).toBeDefined();
    expect(OUTPUT_STYLE_CONFIG.Explanatory?.name).toBe('Explanatory');
    expect(OUTPUT_STYLE_CONFIG.Learning).toBeDefined();
    expect(OUTPUT_STYLE_CONFIG.Learning?.name).toBe('Learning');
    expect(OUTPUT_STYLE_CONFIG.Proactive).toBeDefined();
    expect(OUTPUT_STYLE_CONFIG.Proactive?.name).toBe('Proactive');
  });

  it('provides non-empty prompts for all custom styles', () => {
    expect(OUTPUT_STYLE_CONFIG.Concise?.prompt.length).toBeGreaterThan(50);
    expect(OUTPUT_STYLE_CONFIG.Explanatory?.prompt.length).toBeGreaterThan(50);
    expect(OUTPUT_STYLE_CONFIG.Learning?.prompt.length).toBeGreaterThan(50);
    expect(OUTPUT_STYLE_CONFIG.Proactive?.prompt.length).toBeGreaterThan(50);
  });

  it('resolves all styles via getAllOutputStyles', async () => {
    const allStyles = await getAllOutputStyles(process.cwd());
    expect(allStyles).toHaveProperty(DEFAULT_OUTPUT_STYLE_NAME);
    expect(allStyles).toHaveProperty('Concise');
    expect(allStyles).toHaveProperty('Explanatory');
    expect(allStyles).toHaveProperty('Learning');
    expect(allStyles).toHaveProperty('Proactive');
  });
});
