/**
 * Configuration for the ACP (Agent Communication Protocol) REST API server.
 *
 * This server exposes REST endpoints for external ACP/A2A-compatible agents
 * to discover Clew Code and execute tasks.
 */

export interface ACPRestConfig {
  /** Enable the ACP REST API server */
  enabled: boolean;

  /** HTTP port to listen on */
  port: number;

  /** Host to bind to */
  host: string;
}

export const DEFAULT_ACP_REST_CONFIG: ACPRestConfig = {
  enabled: false,
  port: 8000,
  host: '127.0.0.1',
};

export function resolveACPRestConfig(flags?: { acpRest?: boolean; acpRestPort?: number }): ACPRestConfig {
  return {
    enabled: flags?.acpRest ?? process.env.ACP_REST_ENABLED === 'true',
    port:
      flags?.acpRestPort ??
      (process.env.ACP_REST_PORT ? Number(process.env.ACP_REST_PORT) : DEFAULT_ACP_REST_CONFIG.port),
    host: DEFAULT_ACP_REST_CONFIG.host,
  };
}
