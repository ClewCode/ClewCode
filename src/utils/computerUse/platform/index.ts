/**
 * Platform factory — selects the correct PlatformAdapter based on process.platform.
 */

import type { PlatformAdapter } from './adapter.js';

export type {
  ClickCount,
  CursorPosition,
  DisplayGeometry,
  MouseButton,
  PlatformAdapter,
  ScreenshotResult,
} from './adapter.js';
export { toBase64Jpeg } from './adapter.js';

let cachedAdapter: PlatformAdapter | null = null;

/**
 * Get the PlatformAdapter for the current platform.
 * Cached after first call — the adapter is stateless (each method spawns
 * a fresh CLI process), so it's safe to share.
 */
export function getPlatformAdapter(): PlatformAdapter {
  if (cachedAdapter) return cachedAdapter;

  switch (process.platform) {
    case 'win32': {
      const { createWindowsAdapter } = require('./windows.js');
      cachedAdapter = createWindowsAdapter();
      break;
    }
    case 'darwin': {
      const { createDarwinAdapter } = require('./darwin.js');
      cachedAdapter = createDarwinAdapter();
      break;
    }
    case 'linux': {
      const { createLinuxAdapter } = require('./linux.js');
      cachedAdapter = createLinuxAdapter();
      break;
    }
    default:
      throw new Error(`Unsupported platform: ${process.platform}. Computer use is not available on this platform.`);
  }

  return cachedAdapter!;
}
