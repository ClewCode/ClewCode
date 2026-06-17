/**
 * Custom host adapter for Computer Use — replaces @ant/computer-use-mcp/types.
 * Wraps the PlatformAdapter for use by the MCP server and tool dispatcher.
 */

import type { PlatformAdapter } from './platform/index.js';

// ============================================================================
// Types (replacing @ant/computer-use-mcp/types)
// ============================================================================

export type CoordinateMode = 'pixels' | 'normalized';

export interface CuSubGates {
  pixelValidation: boolean;
  clipboardPasteMultiline: boolean;
  mouseAnimation: boolean;
  hideBeforeAction: boolean;
  autoTargetDisplay: boolean;
  clipboardGuard: boolean;
}

export interface CuPermissionRequest {
  type: 'clipboardRead' | 'clipboardWrite' | 'systemKeyCombos' | 'inputMonitoring';
}

export interface CuPermissionResponse {
  granted: string[];
  denied: string[];
  flags: {
    clipboardRead: boolean;
    clipboardWrite: boolean;
    systemKeyCombos: boolean;
  };
}

export const DEFAULT_GRANT_FLAGS = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
};

export interface CuCallToolResult {
  content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>;
  telemetry?: { error_kind?: string };
}

export interface CuToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ============================================================================
// Host Adapter
// ============================================================================

export interface ComputerUseHostAdapter {
  serverName: string;
  adapter: PlatformAdapter;
  coordinateMode: CoordinateMode;
  subGates: CuSubGates;
  isDisabled: () => boolean;
}

const DEFAULT_SUB_GATES: CuSubGates = {
  pixelValidation: false,
  clipboardPasteMultiline: true,
  mouseAnimation: true,
  hideBeforeAction: false,
  autoTargetDisplay: true,
  clipboardGuard: true,
};

export type ComputerUseBackend = 'builtin' | 'anthropic';

let cached: ComputerUseHostAdapter | undefined;
let cachedBackendType: ComputerUseBackend | undefined;

/**
 * Auto-detect the best available backend.
 * Priority: builtin (always works, CLI-based) → anthropic (if @ant packages installed).
 * The builtin backend uses PowerShell/cliclick/xdotool + sharp and requires no
 * native addons. The anthropic backend uses @ant/computer-use-* native modules.
 */
export function getComputerUseBackend(): ComputerUseBackend {
  if (cachedBackendType) return cachedBackendType;

  if (process.env.COMPUTER_USE_BACKEND === 'anthropic') {
    // Check if @ant packages are available
    try {
      require.resolve('@ant/computer-use-mcp');
      require.resolve('@ant/computer-use-input');
      cachedBackendType = 'anthropic';
      return 'anthropic';
    } catch {
      logForDebugging('[cu-backend] anthropic backend requested but @ant packages not found, falling back to builtin', {
        level: 'warn',
      });
    }
  }

  cachedBackendType = 'builtin';
  return 'builtin';
}

export function getComputerUseHostAdapter(): ComputerUseHostAdapter {
  if (cached) return cached;

  const backend = getComputerUseBackend();
  logForDebugging(`[cu-backend] Using ${backend} backend`);

  const { getPlatformAdapter } = require('./platform/index.js');
  cached = {
    serverName: 'computer-use',
    adapter: getPlatformAdapter(),
    coordinateMode: 'pixels',
    subGates: DEFAULT_SUB_GATES,
    isDisabled: () => false,
  };
  return cached;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export function buildComputerUseTools(coordinateMode: CoordinateMode): CuToolDefinition[] {
  const coordNote = coordinateMode === 'normalized' ? ' (0-1 range)' : ' (pixels)';
  const _coordDesc =
    coordinateMode === 'normalized'
      ? 'Use 0-1 range where (0,0) is top-left and (1,1) is bottom-right of the display.'
      : 'Use pixel coordinates where (0,0) is top-left of the display.';
  return [
    {
      name: 'screenshot',
      description: 'Capture a screenshot of the current display and return it as a base64-encoded JPEG image.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'mouse_move',
      description: `Move the mouse cursor to the specified position${coordNote}.`,
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: `X coordinate${coordNote}` },
          y: { type: 'integer', description: `Y coordinate${coordNote}` },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'click',
      description: `Click at the specified position${coordNote}. Supports left, right, or middle button and single/double/triple click.`,
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: `X coordinate${coordNote}` },
          y: { type: 'integer', description: `Y coordinate${coordNote}` },
          button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
          click_count: { type: 'integer', enum: [1, 2, 3], default: 1 },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'drag',
      description: `Drag the mouse from one position to another${coordNote}.`,
      input_schema: {
        type: 'object',
        properties: {
          start_x: { type: 'integer', description: `Starting X coordinate${coordNote}` },
          start_y: { type: 'integer', description: `Starting Y coordinate${coordNote}` },
          end_x: { type: 'integer', description: `Ending X coordinate${coordNote}` },
          end_y: { type: 'integer', description: `Ending Y coordinate${coordNote}` },
        },
        required: ['start_x', 'start_y', 'end_x', 'end_y'],
      },
    },
    {
      name: 'scroll',
      description: `Scroll at the specified position${coordNote}.`,
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: `X coordinate${coordNote}` },
          y: { type: 'integer', description: `Y coordinate${coordNote}` },
          scroll_x: { type: 'integer', description: 'Horizontal scroll amount (positive=right, negative=left)' },
          scroll_y: { type: 'integer', description: 'Vertical scroll amount (positive=up, negative=down)' },
        },
        required: ['x', 'y', 'scroll_x', 'scroll_y'],
      },
    },
    {
      name: 'key',
      description:
        'Press a key or key combination (e.g. "ctrl+shift+a", "enter", "escape"). Modifier keys supported: ctrl, shift, alt, meta, command.',
      input_schema: {
        type: 'object',
        properties: {
          keys: { type: 'string', description: 'Key or key combination to press' },
        },
        required: ['keys'],
      },
    },
    {
      name: 'type',
      description: 'Type text into the currently focused field. Uses clipboard paste for reliability.',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
    {
      name: 'cursor_position',
      description: 'Get the current mouse cursor position.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_displays',
      description: 'List available displays and their dimensions.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
  ];
}
