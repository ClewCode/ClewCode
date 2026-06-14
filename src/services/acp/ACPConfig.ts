/**
 * Configuration for the Agent Client Protocol (ACP) server.
 *
 * ACP enables code editors/IDEs to communicate with Clew Code as a coding agent,
 * following the JSON-RPC based Agent Client Protocol specification.
 */
export interface ACPConfig {
  /** Enable ACP server mode */
  enabled: boolean;

  /** Transport type: stdio (local) or websocket (remote) */
  transport: 'stdio' | 'websocket';

  /** WebSocket port (only used for websocket transport) */
  port: number;

  /** Host to bind WebSocket server to */
  host: string;

  /** Optional authentication token for remote connections */
  authToken?: string;

  /** Maximum session age in minutes before auto-close */
  sessionMaxAgeMinutes: number;

  /** Mesh provider ID for executing prompts (default: 'codex') */
  meshProviderId: string;
}

export const DEFAULT_ACP_CONFIG: ACPConfig = {
  enabled: false,
  transport: 'stdio',
  port: 15_793,
  host: '127.0.0.1',
  sessionMaxAgeMinutes: 60,
  meshProviderId: 'codex',
};

/**
 * Resolve ACP config from CLI flags and environment variables.
 */
export function resolveACPConfig(flags?: {
  acp?: boolean;
  acpPort?: number;
  acpTransport?: string;
  acpHost?: string;
  acpMeshProvider?: string;
}): ACPConfig {
  return {
    enabled: flags?.acp ?? process.env.ACP_ENABLED === 'true',
    transport: (flags?.acpTransport as 'stdio' | 'websocket') ?? 'stdio',
    port: flags?.acpPort ?? (process.env.ACP_PORT ? Number(process.env.ACP_PORT) : DEFAULT_ACP_CONFIG.port),
    host: flags?.acpHost ?? process.env.ACP_HOST ?? DEFAULT_ACP_CONFIG.host,
    authToken: process.env.ACP_AUTH_TOKEN,
    sessionMaxAgeMinutes: DEFAULT_ACP_CONFIG.sessionMaxAgeMinutes,
    meshProviderId: flags?.acpMeshProvider ?? process.env.ACP_MESH_PROVIDER ?? DEFAULT_ACP_CONFIG.meshProviderId,
  };
}
