import type { ConfigScope, MCPServerConnection, McpServerConfig } from '../../services/mcp/types.js';

/**
 * Display info for a configured MCP server, assembled by MCPSettings from
 * the live connection state plus its config scope/transport.
 */
export type ServerInfo = {
  name: string;
  client: MCPServerConnection;
  scope: ConfigScope;
  transport: 'sse' | 'http' | 'stdio' | 'claudeai-proxy';
  isAuthenticated?: boolean;
  config: McpServerConfig;
};

/** MCP server defined inside an agent's frontmatter, for display in /mcp. */
export type AgentMcpServerInfo = {
  name: string;
  sourceAgents: string[];
  transport: 'stdio' | 'sse' | 'http' | 'ws';
  needsAuth: boolean;
  isAuthenticated?: boolean;
  command?: string;
  url?: string;
};

/** View state for the /mcp settings UI. */
export type MCPViewState =
  | { type: 'list'; defaultTab?: string }
  | { type: 'server-menu'; server: ServerInfo }
  | { type: 'server-tools'; server: ServerInfo }
  | { type: 'server-tool-detail'; server: ServerInfo; toolIndex: number }
  | { type: 'agent-server-menu'; agentServer: AgentMcpServerInfo };

// Re-exports used by components that import specific server info types.
export type ClaudeAIServerInfo = ServerInfo & { transport: 'claudeai-proxy' };
export type SSEServerInfo = ServerInfo & { transport: 'sse' };
export type HTTPServerInfo = ServerInfo & { transport: 'http' };
export type StdioServerInfo = ServerInfo & { transport: 'stdio' };
