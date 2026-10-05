// MCP UI types. Re-exported connection/config types come from the service layer.
export type {
  ConfigScope,
  MCPServerConnection,
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../services/mcp/types.js';

import type {
  ConfigScope,
  MCPServerConnection,
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../services/mcp/types.js';

type ServerBase = {
  name: string;
  client: MCPServerConnection;
  scope: ConfigScope;
};

export type StdioServerInfo = ServerBase & {
  transport: 'stdio';
  config: McpStdioServerConfig;
};

export type SSEServerInfo = ServerBase & {
  transport: 'sse';
  isAuthenticated: boolean | undefined;
  config: McpSSEServerConfig;
};

export type HTTPServerInfo = ServerBase & {
  transport: 'http';
  isAuthenticated: boolean | undefined;
  config: McpHTTPServerConfig;
};

export type ClaudeAIServerInfo = ServerBase & {
  transport: 'claudeai-proxy';
  isAuthenticated: boolean | undefined;
  config: McpClaudeAIProxyServerConfig;
};

export type ServerInfo = StdioServerInfo | SSEServerInfo | HTTPServerInfo | ClaudeAIServerInfo;

export type AgentMcpServerInfo = {
  name: string;
  sourceAgents: string[];
  transport: 'stdio' | 'sse' | 'http' | 'ws';
  url?: string;
  command?: string;
  needsAuth: boolean;
  isAuthenticated?: boolean;
};

export type MCPViewState =
  | { type: 'list'; defaultTab?: string }
  | { type: 'server-menu'; server: ServerInfo }
  | { type: 'server-tools'; server: ServerInfo }
  | { type: 'server-tool-detail'; server: ServerInfo; toolIndex: number }
  | { type: 'agent-server-menu'; agentServer: AgentMcpServerInfo };
