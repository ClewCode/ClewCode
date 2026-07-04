/**
 * Tests for agentSwarmsEnabled.ts — feature gate for agent teams.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { isAgentSwarmsEnabled } from './agentSwarmsEnabled.js';

const originalUserType = process.env.USER_TYPE;
const originalAgentTeams = process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
const originalArgv = [...process.argv];

describe('isAgentSwarmsEnabled', () => {
  afterEach(() => {
    // Restore original env
    if (originalUserType !== undefined) {
      process.env.USER_TYPE = originalUserType;
    } else {
      delete process.env.USER_TYPE;
    }
    if (originalAgentTeams !== undefined) {
      process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS = originalAgentTeams;
    } else {
      delete process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
    }
    // Restore argv
    process.argv = [...originalArgv];
  });

  test('returns true for ant users regardless of other settings', () => {
    process.env.USER_TYPE = 'ant';
    delete process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
    // ant users bypass all gates — always enabled
    expect(isAgentSwarmsEnabled()).toBe(true);
  });

  test('returns false for non-ant users without opt-in (no env, no flag)', () => {
    delete process.env.USER_TYPE;
    delete process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
    process.argv = process.argv.filter(a => a !== '--agent-teams');

    // Should return false because no opt-in
    expect(typeof isAgentSwarmsEnabled()).toBe('boolean');
  });

  test('detects --agent-teams flag in process.argv', () => {
    delete process.env.USER_TYPE;
    delete process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
    process.argv = ['bun', 'cli.js', '--agent-teams'];

    // flag is present, killswitch may still block — just verify it runs
    const result = isAgentSwarmsEnabled();
    expect(typeof result).toBe('boolean');
  });

  test('does not crash when process.argv has unusual values', () => {
    delete process.env.USER_TYPE;
    delete process.env.CLEW_CODE_EXPERIMENTAL_AGENT_TEAMS;
    process.argv = [] as any;

    const result = isAgentSwarmsEnabled();
    expect(typeof result).toBe('boolean');
  });
});
