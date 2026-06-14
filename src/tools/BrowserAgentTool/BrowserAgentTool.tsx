/**
 * Browser Agent Tool — Autonomous Web Automation
 */

import * as React from 'react';
import { z } from 'zod/v4';
import { Text } from '../../ink.js';
import type { AgentMode } from '../../services/ai/BrowserAgent.js';
import { BrowserAgent } from '../../services/ai/BrowserAgent.js';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';

export const BROWSER_AGENT_TOOL_NAME = 'browser_agent' as const;

const inputSchema = lazySchema(() =>
  z.object({
    goal: z.string().describe('The goal for the autonomous agent to achieve on the web'),
    maxSteps: z.number().optional().describe('Maximum number of steps to take (default: 15)'),
    mode: z.enum(['vision', 'text']).optional().describe('Agent mode: vision (screenshot-based) or text (accessibility tree-based, works with non-vision models). Default: vision'),
  }),
);

const outputSchema = lazySchema(() =>
  z.object({
    result: z.string(),
  }),
);

export const BrowserAgentTool = buildTool({
  name: BROWSER_AGENT_TOOL_NAME,
  aliases: ['web_agent', 'autonomous_browser'],
  searchHint: 'autonomous web browsing agent vision automation',
  maxResultSizeChars: 100_000,

  get inputSchema() {
    return inputSchema();
  },

  get outputSchema() {
    return outputSchema();
  },

  async description(): Promise<string> {
    return 'Run an autonomous web agent to achieve a goal. Vision mode uses screenshots; text mode uses accessibility tree (no vision model needed). Best for complex multi-step tasks like research or form filling.';
  },

  async prompt(): Promise<string> {
    return `Use this tool to delegate complex web tasks to an autonomous agent.

    Modes:
    - mode: "vision" (default) — uses screenshots, requires vision-capable model
    - mode: "text" — uses accessibility tree + element selectors, works with any model

    Example Goals:
    - "Go to github.com/JonusNattapong and summarize the latest project" (mode: "text")
    - "Find the cheapest flight from BKK to NRT next Monday"
    - "Sign up for a newsletter on example.com with email test@example.com"`;
  },

  isEnabled(): boolean {
    return true;
  },

  async call(input: any): Promise<{ data: any }> {
    const agent = new BrowserAgent({
      maxSteps: input.maxSteps,
      captchaMode: input.captchaMode,
      mode: input.mode as AgentMode | undefined,
    });
    try {
      const result = await agent.runTask({ goal: input.goal, maxSteps: input.maxSteps });
      return { data: { result } };
    } catch (error: any) {
      return { data: { result: `Agent failed: ${error.message}` } };
    }
  },

  renderToolUseMessage(input: any): React.ReactNode {
    return React.createElement(Text, null, `Autonomous Agent: "${input.goal}"`);
  },

  mapToolResultToToolResultBlockParam(data: any, toolUseID: string) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: data.result ?? '',
    };
  },
});
