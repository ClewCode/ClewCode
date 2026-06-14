/**
 * Agent Communication Protocol (ACP) — Agent Manifest model.
 *
 * ACP enables AI agents to communicate across different frameworks.
 * This module provides the manifest schema and helpers for Clew Code
 * to advertise its capabilities to other ACP-compatible agents.
 *
 * Spec: https://agentcommunicationprotocol.dev
 * SDK: acp-sdk (i-am-bee / Linux Foundation Mesh)
 */

/**
 * Agent manifest describing capabilities for ACP discovery.
 */
export interface ACPAgentManifest {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}

/**
 * Create the Clew Code agent manifest.
 */
export function createClewCodeManifest(): ACPAgentManifest {
  return {
    name: 'clew-code',
    description: 'CLI-first local coding agent with multi-provider support',
    metadata: {
      version: '1.0.0',
      provider: 'multi-provider',
      capabilities: 'chat,tool-using,code-edit,code-search',
    },
  };
}

/**
 * Convert a Clew Code peer info entry to an ACP-compatible manifest.
 */
export function peerInfoToManifest(name: string, hostname: string, port: number): ACPAgentManifest {
  return {
    name: name || hostname,
    description: `Clew Code peer at ${hostname}:${port}`,
    metadata: {
      hostname,
      port: String(port),
      protocol: 'acp',
    },
  };
}
