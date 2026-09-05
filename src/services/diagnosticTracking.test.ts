import { describe, expect, test } from 'bun:test';
import { DiagnosticTrackingService } from './diagnosticTracking.js';
import type { MCPServerConnection } from './mcp/types.js';

function client(name: string): MCPServerConnection {
  return { name, type: 'connected' } as unknown as MCPServerConnection;
}

describe('DiagnosticTrackingService MCP lifecycle', () => {
  test('refreshes the IDE client after reconnect', async () => {
    const service = DiagnosticTrackingService.getInstance();
    const first = client('first');
    const reconnected = client('reconnected');

    service.initialize(first);
    service.initialize(reconnected);

    expect((service as unknown as { mcpClient?: MCPServerConnection }).mcpClient).toBe(reconnected);
    await service.shutdown();
  });
});
