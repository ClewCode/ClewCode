import { describe, expect, it, test } from 'bun:test';
import type { Tool } from '../../Tool.js';
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js';
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js';
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js';
import type { Message } from '../../types/message.js';
import { agentToolResultSchema, countToolUses, extractPartialResult, filterToolsForAgent } from './agentToolUtils.js';
import { AGENT_TOOL_NAME } from './constants.js';

const agentTool = { name: AGENT_TOOL_NAME } as Tool;
const mcpTool = { name: 'mcp__github__create_issue' } as Tool;
const bashTool = { name: BASH_TOOL_NAME } as Tool;
const fileReadTool = { name: FILE_READ_TOOL_NAME } as Tool;
const fileWriteTool = { name: FILE_WRITE_TOOL_NAME } as Tool;

describe('Agent tool filtering', () => {
  test('disallows Agent tool for general-purpose agent to prevent recursive runaway', () => {
    expect(filterToolsForAgent({ tools: [agentTool], isBuiltIn: true })).toEqual([]);
  });

  test('always allows MCP tools for all agents', () => {
    const result = filterToolsForAgent({
      tools: [mcpTool, fileReadTool],
      isBuiltIn: false,
    });
    expect(result).toContain(mcpTool);
    expect(result).toContain(fileReadTool);
  });

  test('filters async agent allowed tools in async mode', () => {
    const result = filterToolsForAgent({
      tools: [bashTool, fileReadTool, fileWriteTool],
      isBuiltIn: true,
      isAsync: true,
    });
    expect(result).toContain(bashTool);
    expect(result).toContain(fileReadTool);
    expect(result).toContain(fileWriteTool);
  });
});

describe('countToolUses', () => {
  it('correctly counts tool_use blocks in assistant messages', () => {
    const messages: Message[] = [
      {
        type: 'user',
        message: { role: 'user', content: 'hello' },
        uuid: '1' as any,
        timestamp: new Date().toISOString(),
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'thinking' },
            { type: 'tool_use', id: 't1', name: 'FileRead', input: {} },
            { type: 'tool_use', id: 't2', name: 'FileWrite', input: {} },
          ],
        },
        uuid: '2' as any,
        timestamp: new Date().toISOString(),
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 't3', name: 'Bash', input: {} }],
        },
        uuid: '3' as any,
        timestamp: new Date().toISOString(),
      },
    ];

    expect(countToolUses(messages)).toBe(3);
  });

  it('returns 0 when no tool_use blocks are present', () => {
    const messages: Message[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'just text' }],
        },
        uuid: '1' as any,
        timestamp: new Date().toISOString(),
      },
    ];

    expect(countToolUses(messages)).toBe(0);
  });
});

describe('extractPartialResult', () => {
  it('extracts latest assistant text when available', () => {
    const messages: Message[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Final summary of investigation' }],
        },
        uuid: '1' as any,
        timestamp: new Date().toISOString(),
      },
    ];

    expect(extractPartialResult(messages)).toBe('Final summary of investigation');
  });

  it('returns undefined when no messages provided', () => {
    expect(extractPartialResult([])).toBeUndefined();
  });
});

describe('agentToolResultSchema validation', () => {
  it('validates a well-formed AgentToolResult', () => {
    const sample = {
      agentId: 'subagent-123',
      content: [{ type: 'text' as const, text: 'Investigation complete' }],
      totalToolUseCount: 5,
      totalDurationMs: 1250,
      totalTokens: 3400,
      usage: {
        input_tokens: 2000,
        output_tokens: 1400,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        cache_creation: null,
      },
    };

    const parsed = agentToolResultSchema().safeParse(sample);
    expect(parsed.success).toBe(true);
  });

  it('validates AgentToolResult with failed status', () => {
    const failedSample = {
      agentId: 'subagent-456',
      content: [{ type: 'text' as const, text: 'API error occurred' }],
      totalToolUseCount: 0,
      totalDurationMs: 500,
      totalTokens: 100,
      status: 'failed',
      usage: {
        input_tokens: 100,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        cache_creation: null,
      },
    };

    const parsed = agentToolResultSchema().safeParse(failedSample);
    expect(parsed.success).toBe(true);
  });
});
