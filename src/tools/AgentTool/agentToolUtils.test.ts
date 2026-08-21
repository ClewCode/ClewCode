import { describe, expect, test } from 'bun:test';
import type { Tool } from '../../Tool.js';
import { filterToolsForAgent } from './agentToolUtils.js';
import { AGENT_TOOL_NAME } from './constants.js';

const agentTool = { name: AGENT_TOOL_NAME } as Tool;

describe('Agent tool filtering', () => {
  test('disallows Agent tool for general-purpose agent', () => {
    expect(filterToolsForAgent({ tools: [agentTool], isBuiltIn: true })).toEqual([]);
  });
});
