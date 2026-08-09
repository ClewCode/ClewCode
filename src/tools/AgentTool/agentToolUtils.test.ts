import { describe, expect, test } from 'bun:test';
import type { Tool } from '../../Tool.js';
import { filterToolsForAgent } from './agentToolUtils.js';
import { AGENT_TOOL_NAME } from './constants.js';

const agentTool = { name: AGENT_TOOL_NAME } as Tool;

describe('RLM recursive tool access', () => {
  test('allows Agent only for synchronous RLM children', () => {
    expect(filterToolsForAgent({ tools: [agentTool], isBuiltIn: true, agentType: 'rlm' })).toEqual([agentTool]);
    expect(filterToolsForAgent({ tools: [agentTool], isBuiltIn: true, agentType: 'rlm', isAsync: true })).toEqual([]);
    expect(filterToolsForAgent({ tools: [agentTool], isBuiltIn: true, agentType: 'general-purpose' })).toEqual([]);
  });
});
