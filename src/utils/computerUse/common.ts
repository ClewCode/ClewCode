/**
 * Common constants and utilities for Computer Use.
 */

import { normalizeNameForMCP } from '../../services/mcp/normalization.js';

export const COMPUTER_USE_MCP_SERVER_NAME = 'computer-use';

export function isComputerUseMCPServer(name: string): boolean {
  return normalizeNameForMCP(name) === COMPUTER_USE_MCP_SERVER_NAME;
}
