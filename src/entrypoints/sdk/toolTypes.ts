/**
 * SDK Tool Types — Internal SDK tool type declarations.
 *
 * All marked @internal until SDK API stabilizes.
 */

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolResult = {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: unknown;
  }>;
  isError?: boolean;
};
