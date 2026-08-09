import { afterEach, describe, expect, test } from 'bun:test';
import {
  BUILT_IN_MODES,
  getActiveModeName,
  getModeConfig,
  getModeSection,
  listModes,
  MODE_OFF,
  resetSessionMode,
  setActiveMode,
} from './modes.js';

afterEach(() => {
  resetSessionMode();
  delete process.env.CLEW_CODE_MODE;
});

describe('built-in modes', () => {
  test('every mode has a lowercase name, a description and a non-empty prompt', () => {
    for (const mode of BUILT_IN_MODES) {
      expect(mode.name).toBe(mode.name.toLowerCase());
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.prompt.trim().length).toBeGreaterThan(0);
      expect(mode.source).toBe('built-in');
    }
  });

  test('names are unique', () => {
    const names = BUILT_IN_MODES.map(m => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('no built-in name collides with the off sentinel', () => {
    expect(BUILT_IN_MODES.some(m => m.name === MODE_OFF)).toBe(false);
  });
});

describe('setActiveMode / getActiveModeName', () => {
  test('a session-only switch does not touch settings', () => {
    setActiveMode('reviewer', { persist: false });
    expect(getActiveModeName()).toBe('reviewer');
  });

  test('names are normalized to lowercase', () => {
    setActiveMode('ReViewer', { persist: false });
    expect(getActiveModeName()).toBe('reviewer');
  });

  test('"off" clears the mode', () => {
    setActiveMode('reviewer', { persist: false });
    setActiveMode(MODE_OFF, { persist: false });
    expect(getActiveModeName()).toBeUndefined();
  });

  test('an explicit session choice wins over the environment', () => {
    process.env.CLEW_CODE_MODE = 'socratic';
    setActiveMode('reviewer', { persist: false });
    expect(getActiveModeName()).toBe('reviewer');
  });

  test('the environment applies when nothing was chosen this session', () => {
    process.env.CLEW_CODE_MODE = 'socratic';
    expect(getActiveModeName()).toBe('socratic');
  });

  test('CLEW_CODE_MODE=off disables modes', () => {
    process.env.CLEW_CODE_MODE = 'off';
    expect(getActiveModeName()).toBeUndefined();
  });
});

describe('getModeConfig', () => {
  test('resolves a built-in by name, case-insensitively', async () => {
    expect((await getModeConfig('RolePlay'))?.name).toBe('roleplay');
  });

  test('returns undefined for the off sentinel and for unknown names', async () => {
    expect(await getModeConfig(MODE_OFF)).toBeUndefined();
    expect(await getModeConfig('')).toBeUndefined();
    expect(await getModeConfig('definitely-not-a-mode')).toBeUndefined();
  });
});

describe('listModes', () => {
  test('includes every built-in and is sorted by name', async () => {
    const modes = await listModes();
    for (const builtIn of BUILT_IN_MODES) {
      expect(modes.some(m => m.name === builtIn.name)).toBe(true);
    }
    expect(modes.map(m => m.name)).toEqual([...modes.map(m => m.name)].sort());
  });
});

describe('getModeSection', () => {
  test('is null when no mode is set', async () => {
    expect(await getModeSection()).toBeNull();
  });

  test('carries the mode prompt and states that it does not expand what Clew will do', async () => {
    setActiveMode('reviewer', { persist: false });
    const section = await getModeSection();
    expect(section).toContain('# Mode: reviewer');
    expect(section).toContain('they do not expand what you are willing to do');
    const reviewer = BUILT_IN_MODES.find(m => m.name === 'reviewer');
    expect(section).toContain(reviewer!.prompt);
  });

  test('is null for a mode name that no longer resolves', async () => {
    setActiveMode('deleted-custom-mode', { persist: false });
    expect(await getModeSection()).toBeNull();
  });
});
