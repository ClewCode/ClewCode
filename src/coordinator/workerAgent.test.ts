import { afterEach, describe, expect, it } from 'bun:test';
import { getBuiltInAgents } from '../tools/AgentTool/builtInAgents.js';
import { getCoordinatorAgents } from './workerAgent.js';

const originalCoordinatorMode = process.env.CLEW_CODE_COORDINATOR_MODE;

afterEach(() => {
  if (originalCoordinatorMode === undefined) {
    delete process.env.CLEW_CODE_COORDINATOR_MODE;
  } else {
    process.env.CLEW_CODE_COORDINATOR_MODE = originalCoordinatorMode;
  }
});

describe('coordinator worker registry', () => {
  it('provides the default general-purpose worker', () => {
    expect(getCoordinatorAgents().map(agent => agent.agentType)).toContain('general-purpose');
  });

  it('keeps default AgentTool delegation resolvable in coordinator mode', () => {
    process.env.CLEW_CODE_COORDINATOR_MODE = '1';
    expect(getBuiltInAgents().map(agent => agent.agentType)).toContain('general-purpose');
  });
});
