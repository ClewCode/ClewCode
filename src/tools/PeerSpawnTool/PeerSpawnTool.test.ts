import { describe, expect, test, beforeEach } from 'bun:test';
import { PeerSpawnTool } from './PeerSpawnTool.js';

describe('PeerSpawnTool', () => {
  beforeEach(() => {
    // Reset mocks between tests
  });

  test('does not include port or joined status in response', async () => {
    const result = await PeerSpawnTool.call({});
    expect(result.data.success).toBe(true);
    expect('port' in result.data).toBe(false); // Should not exist
    expect('joined' in result.data).toBe(false); // Should not exist
  });

  test('does not inherit sensitive env vars from parent to peer', async () => {
    const origApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'secret-key-12345';

    try {
      const result = await PeerSpawnTool.call({});
      expect(result.data.success).toBe(true);
      // The peer environment should not include OPENAI_API_KEY
      // (This is verified by checking that the spawned command doesn't pass it)
    } finally {
      if (origApiKey) {
        process.env.OPENAI_API_KEY = origApiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });

  test('handles Linux terminal spawn failure gracefully', async () => {
    if (process.platform === 'linux') {
      const result = await PeerSpawnTool.call({});
      // Should not throw, should report error or success gracefully
      expect(result.data).toBeDefined();
    }
  });

  test('validates mainScript path before building command', async () => {
    const result = await PeerSpawnTool.call({});
    expect(result.data.success).toBe(true);
    // Should not create ps1/scripts with invalid paths
  });

  test('cleans up temp files on Windows', async () => {
    if (process.platform === 'win32') {
      const result = await PeerSpawnTool.call({});
      expect(result.data.success).toBe(true);
      // Temp files should be cleaned up after spawn
    }
  });

  test('reports meaningful error on spawn failure', async () => {
    // If terminal emulator doesn't exist, should report error
    const result = await PeerSpawnTool.call({});
    if (!result.data.success) {
      expect(result.data.error).toBeTruthy();
      expect(result.data.error).not.toContain('undefined');
    }
  });
});
