import { describe, expect, test } from 'bun:test';
import {
  cacheKeyFor,
  clearSystemPromptSections,
  resolveSystemPromptSections,
  systemPromptSection,
} from './systemPromptSections.js';

describe('cacheKeyFor', () => {
  test('is the bare name when there are no deps', () => {
    expect(cacheKeyFor({ name: 'memory' })).toBe('memory');
    expect(cacheKeyFor({ name: 'memory', deps: [] })).toBe('memory');
  });

  test('distinguishes the same section across different deps', () => {
    const a = cacheKeyFor({ name: 'env', deps: ['claude-opus-4-8'] });
    const b = cacheKeyFor({ name: 'env', deps: ['claude-sonnet-5'] });
    expect(a).not.toBe(b);
  });

  test('cannot be spoofed by a name containing the joined dep', () => {
    // A separator that appears in ordinary text (e.g. ":") would let
    // {name: "a:b"} collide with {name: "a", deps: ["b"]}.
    expect(cacheKeyFor({ name: 'a:b' })).not.toBe(cacheKeyFor({ name: 'a', deps: ['b'] }));
  });
});

describe('resolveSystemPromptSections', () => {
  test('memoizes a section across repeated resolves', async () => {
    clearSystemPromptSections();
    let calls = 0;
    const build = () => systemPromptSection('static', () => `computed ${++calls}`);

    expect(await resolveSystemPromptSections([build()])).toEqual(['computed 1']);
    expect(await resolveSystemPromptSections([build()])).toEqual(['computed 1']);
    expect(calls).toBe(1);
  });

  test('recomputes when a declared dep changes, and reuses the prior value on switch-back', async () => {
    clearSystemPromptSections();
    const build = (model: string) => systemPromptSection('env', () => `powered by ${model}`, [model]);

    expect(await resolveSystemPromptSections([build('opus')])).toEqual(['powered by opus']);
    // The bug: a name-only cache key returned "powered by opus" here.
    expect(await resolveSystemPromptSections([build('sonnet')])).toEqual(['powered by sonnet']);
    expect(await resolveSystemPromptSections([build('opus')])).toEqual(['powered by opus']);
  });

  test('caches a null result rather than recomputing it', async () => {
    clearSystemPromptSections();
    let calls = 0;
    const build = () =>
      systemPromptSection('maybe', () => {
        calls++;
        return null;
      });

    expect(await resolveSystemPromptSections([build()])).toEqual([null]);
    expect(await resolveSystemPromptSections([build()])).toEqual([null]);
    expect(calls).toBe(1);
  });

  test('clearSystemPromptSections drops dep-keyed entries too', async () => {
    clearSystemPromptSections();
    let calls = 0;
    const build = () => systemPromptSection('env', () => `v${++calls}`, ['opus']);

    expect(await resolveSystemPromptSections([build()])).toEqual(['v1']);
    clearSystemPromptSections();
    expect(await resolveSystemPromptSections([build()])).toEqual(['v2']);
  });
});
