import { useMemo } from 'react';
import type { MCPServerConnection } from '../services/mcp/types.js';

export function mergeClients(
  initialClients: MCPServerConnection[] | undefined,
  mcpClients: readonly MCPServerConnection[] | undefined,
): MCPServerConnection[] {
  const initial = initialClients ?? [];
  const current = mcpClients ?? [];
  if (initial.length === 0) return [...current];
  if (current.length === 0) return [...initial];

  // Preserve startup ordering, but let the live MCP store replace same-name
  // clients after reconnects. New live clients are appended.
  const currentByName = new Map(current.map(client => [client.name, client]));
  const initialNames = new Set(initial.map(client => client.name));
  return [
    ...initial.map(client => currentByName.get(client.name) ?? client),
    ...current.filter(client => !initialNames.has(client.name)),
  ];
}

export function useMergedClients(
  initialClients: MCPServerConnection[] | undefined,
  mcpClients: MCPServerConnection[] | undefined,
): MCPServerConnection[] {
  return useMemo(() => mergeClients(initialClients, mcpClients), [initialClients, mcpClients]);
}
