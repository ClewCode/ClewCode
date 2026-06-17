/**
 * Computer Use Tool — Entry Point
 *
 * Main export file for the Computer Use Tool module.
 * Provides a clean API for the rest of the codebase.
 *
 * Usage:
 *   import { setupComputerUse, handleComputerAction } from './tools/ComputerUseTool/index.js'
 *
 *   // At startup (if ENABLE_COMPUTER_USE=1):
 *   const config = await setupComputerUse(providerName)
 *
 *   // When Claude requests a computer action:
 *   const result = await handleComputerAction(input, config.displayConfig)
 *
 * Built from scratch by Dek1MillionToken. No @ant/* dependencies.
 */

import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';
import { logForDebugging } from '../../utils/debug.js';
import { buildDisplayConfig } from './scaling.js';
import { getScreenDimensions } from './screenshot.js';
import type { ComputerUseToolConfig } from './toolDefinition.js';
import { getComputerUseToolConfig, isComputerUseCapable } from './toolDefinition.js';
import type { ComputerUseMode, DisplayConfig } from './types.js';

// ── Public Types ─────────────────────────────────────────────────────────────

export interface ComputerUseSetup {
  /** Whether computer use is enabled */
  enabled: boolean;
  /** The mode (anthropic or generic) */
  mode: ComputerUseMode;
  /** Display configuration for coordinate scaling */
  displayConfig: DisplayConfig;
  /** Tool config to inject into API calls */
  toolConfig: ComputerUseToolConfig;
}

// ── Setup ────────────────────────────────────────────────────────────────────

/**
 * Initialize the Computer Use system.
 * Call this at startup when ENABLE_COMPUTER_USE=1.
 *
 * @param provider - Active provider ID
 * @returns Setup config, or null if not supported
 */
export async function setupComputerUse(provider: ProviderId): Promise<ComputerUseSetup | null> {
  // Check platform
  if (process.platform !== 'win32') {
    logForDebugging('[ComputerUse] Skipped: not Windows');
    return null;
  }

  // Check env var
  if (process.env.ENABLE_COMPUTER_USE !== '1') {
    return null;
  }

  // Check provider capability
  if (!isComputerUseCapable(provider)) {
    logForDebugging(`[ComputerUse] Skipped: provider "${provider}" does not support vision`);
    return null;
  }

  // Get screen dimensions
  const screen = await getScreenDimensions();
  logForDebugging(`[ComputerUse] Screen: ${screen.width}x${screen.height}`);

  // Build display config (handles scaling)
  const displayConfig = buildDisplayConfig(screen.width, screen.height);
  logForDebugging(
    `[ComputerUse] API dimensions: ${displayConfig.apiWidth}x${displayConfig.apiHeight} ` +
      `(scale: ${displayConfig.scaleFactor.toFixed(3)})`,
  );

  // Get tool config for this provider
  const toolConfig = getComputerUseToolConfig(provider, displayConfig.apiWidth, displayConfig.apiHeight);
  logForDebugging(`[ComputerUse] Mode: ${toolConfig.mode} (provider: ${provider})`);

  return {
    enabled: true,
    mode: toolConfig.mode,
    displayConfig,
    toolConfig,
  };
}

/**
 * Check if computer use is enabled via environment variable.
 */
export function isComputerUseEnabled(): boolean {
  return process.env.ENABLE_COMPUTER_USE === '1' && process.platform === 'win32';
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export { handleComputerAction } from './handler.js';
export { buildDisplayConfig, getScaleFactor, scaleToApi, scaleToScreen } from './scaling.js';
export { captureScreenshot, getScreenDimensions } from './screenshot.js';
export type { ComputerUseToolConfig } from './toolDefinition.js';
export { getComputerUseToolConfig, isComputerUseCapable } from './toolDefinition.js';
export type {
  ComputerAction,
  ComputerExecutor,
  ComputerToolInput,
  ComputerToolResultBlock,
  ComputerUseMode,
  DisplayConfig,
  DisplayInfo,
} from './types.js';
