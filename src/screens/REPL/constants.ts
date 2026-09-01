import type { ScrollBoxHandle } from '../../ink/components/ScrollBox.js';
import type { MCPServerConnection } from '../../services/mcp/types.js';

export const EMPTY_MCP_CLIENTS: MCPServerConnection[] = [];

export const HISTORY_STUB = {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: intentional noop stub
  maybeLoadOlder: (_: ScrollBoxHandle) => {},
};

export const RECENT_SCROLL_REPIN_WINDOW_MS = 3000;
