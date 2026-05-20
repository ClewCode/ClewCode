/**
 * Setup Computer Use MCP configuration.
 * Replaces @ant/computer-use-mcp with our own tool definitions.
 */

import { join } from 'path';
import { fileURLToPath } from 'url';
import { buildMcpToolName } from '../../services/mcp/mcpStringUtils.js';
import type { ScopedMcpServerConfig } from '../../services/mcp/types.js';

import { isInBundledMode } from '../bundledMode.js';
import { COMPUTER_USE_MCP_SERVER_NAME } from './common.js';
import { buildComputerUseTools, getComputerUseHostAdapter } from './hostAdapter.js';

/**
 * Build the dynamic MCP config + allowed tool names.
 * The `mcp__computer-use__*` tools are added to `allowedTools` so they
 * bypass the normal permission prompt.
 */
export function setupComputerUseMCP(): {
  mcpConfig: Record<string, ScopedMcpServerConfig>;
  allowedTools: string[];
} {
  const { coordinateMode } = getComputerUseHostAdapter();
  const tools = buildComputerUseTools(coordinateMode);
  const allowedTools = tools.map(t => buildMcpToolName(COMPUTER_USE_MCP_SERVER_NAME, t.name));

  const args = isInBundledMode()
    ? ['--computer-use-mcp']
    : [join(fileURLToPath(import.meta.url), '..', 'cli.js'), '--computer-use-mcp'];

  return {
    mcpConfig: {
      [COMPUTER_USE_MCP_SERVER_NAME]: {
        type: 'stdio',
        command: process.execPath,
        args,
        scope: 'dynamic',
      } as const,
    },
    allowedTools,
  };
}
