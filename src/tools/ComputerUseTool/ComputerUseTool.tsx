/**
 * Computer Use Tool — Main Tool Implementation
 *
 * Registers as a standard Tool in the Clew Code tool system.
 * Supports dual-mode operation:
 *   - Anthropic provider: Uses official computer_20251124 schema (handled by API layer)
 *   - Other providers: Uses standard JSON schema tool definition (this tool)
 *
 * For all providers, the action handler (screenshot, click, type, key, scroll)
 * uses PowerShell + Win32 API on Windows. No external dependencies.
 *
 * Built from scratch by Dek1MillionToken. No @ant/* dependencies.
 */

import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import * as React from 'react';
import { z } from 'zod/v4';
import { Text } from '../../ink.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { logForDebugging } from '../../utils/debug.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { handleComputerAction } from './handler.js';
import { buildDisplayConfig } from './scaling.js';
import { getScreenDimensions } from './screenshot.js';
import type { ComputerToolInput, DisplayConfig } from './types.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const COMPUTER_USE_TOOL_NAME = 'computer' as const;

// ── Cached Display Config ────────────────────────────────────────────────────

let cachedDisplayConfig: DisplayConfig | null = null;

async function getDisplayConfig(): Promise<DisplayConfig> {
  if (!cachedDisplayConfig) {
    const screen = await getScreenDimensions();
    cachedDisplayConfig = buildDisplayConfig(screen.width, screen.height);
    logForDebugging(
      `[ComputerUse] Display: ${screen.width}x${screen.height} → API: ${cachedDisplayConfig.apiWidth}x${cachedDisplayConfig.apiHeight}`,
    );
  }
  return cachedDisplayConfig;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const inputSchema = lazySchema(() =>
  z.preprocess(
    (val: any) => {
      // Handle cases where the model wraps parameters in a key
      if (val && val.computer && typeof val.computer === 'object') return val.computer;
      if (val && val.parameters && typeof val.parameters === 'object') return val.parameters;
      if (val && val.input && typeof val.input === 'object') return val.input;
      return val;
    },
    z
      .object({
        action: z.any().describe('The action to perform'),
        coordinate: z.any().describe('[x, y] coordinates'),
        text: z.any().describe('Text to type'),
        key: z.any().describe('Key to press'),
        scroll_direction: z.any().describe('Scroll direction'),
        scroll_amount: z.any().describe('Scroll amount'),
        start_coordinate: z.any().describe('Start [x, y] for drag'),
        duration: z.any().describe('Duration in seconds'),
        region: z.any().describe('Region to zoom into [x1, y1, x2, y2]'),
        window_query: z.any().describe('Window title or ID to focus'),
      })
      .passthrough(),
  ),
);
type InputSchema = ReturnType<typeof inputSchema>;
type Input = any; // Use any for maximum flexibility in the call method

// ── Output ───────────────────────────────────────────────────────────────────

const outputSchema = lazySchema(() =>
  z.object({
    result: z.string().describe('Text description of the action performed'),
    screenshot: z.string().optional().describe('Base64 JPEG screenshot data'),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;
type Out = z.infer<OutputSchema>;

// ── Tool Definition ──────────────────────────────────────────────────────────

export const ComputerUseTool = buildTool({
  name: COMPUTER_USE_TOOL_NAME,
  aliases: ['ComputerUse'],
  searchHint: 'control mouse keyboard screenshot desktop automation',
  maxResultSizeChars: 100_000, // Screenshots can be large

  async description(): Promise<string> {
    return 'Control the mouse and keyboard, and take screenshots to interact with the computer desktop GUI.';
  },

  async prompt(): Promise<string> {
    const config = await getDisplayConfig().catch(() => ({
      screenWidth: 0,
      screenHeight: 0,
      scaleFactor: 1,
      apiWidth: 1280,
      apiHeight: 800,
    }));
    return `Control the computer screen to complete tasks autonomously.

IMPORTANT: Always take a screenshot FIRST to see what is currently on screen before performing any actions.

Available actions:
- screenshot: Capture what is currently displayed on screen
- left_click: Click at [x, y] coordinates (coordinate required)
- right_click: Right-click at [x, y] coordinates (coordinate required)
- double_click: Double-click at [x, y] coordinates (coordinate required)
- triple_click: Triple-click at [x, y] coordinates (coordinate required)
- middle_click: Middle-click at [x, y] coordinates (coordinate required)
- type: Type a text string (text required)
- key: Press a key combination like "ctrl+s", "enter", "alt+f4" (key required)
- mouse_move: Move cursor to [x, y] coordinates (coordinate required)
- scroll: Scroll at [x, y] in a direction (coordinate, scroll_direction required)
- left_click_drag: Drag from start_coordinate to coordinate (both required)
- left_mouse_down: Press mouse button down at optional [x, y]
- left_mouse_up: Release mouse button at optional [x, y]
- hold_key: Hold a key for duration seconds (key, duration required)
- wait: Wait for duration seconds
- cursor_position: Get the current mouse cursor position
- zoom: Capture a specific region [x1, y1, x2, y2] at full resolution (region required)
- list_windows: List all open windows with their titles and positions
- focus_window: Bring a window to the front by title query (window_query required)
Screen dimensions: ${config.apiWidth}x${config.apiHeight} pixels
Coordinates are in pixels relative to the top-left corner (0, 0).

After each action, a screenshot is automatically taken so you can verify the result.
If the result is not what you expected, try again with adjusted coordinates.

Tips:
- Use keyboard shortcuts instead of clicking when possible (more reliable)
- For text input fields, click first, then use "type" action
- For dropdowns, try using keyboard (arrow keys) after clicking
- Use the separate browser tool for websites and selector-based web automation
- Take a screenshot after each step to verify the outcome`;
  },

  isEnabled(): boolean {
    return (
      (process.env.ENABLE_COMPUTER_USE === '1' && process.platform === 'win32') ||
      (process.env.ENABLE_COMPUTER_USE === '1' && process.env.CI === 'true')
    );
  },

  isReadOnly(input: Input): boolean {
    // Only screenshot and cursor_position and list_windows are truly read-only
    return input.action === 'screenshot' || input.action === 'cursor_position' || input.action === 'list_windows';
  },

  isConcurrencySafe(input: Input): boolean {
    return input.action === 'screenshot' || input.action === 'cursor_position' || input.action === 'list_windows';
  },

  toAutoClassifierInput(input: Input) {
    return `${input.action}${input.coordinate ? ` at (${input.coordinate.join(',')})` : ''}${input.text ? ` "${input.text}"` : ''}${input.key ? ` ${input.key}` : ''}`;
  },

  get inputSchema(): InputSchema {
    return inputSchema();
  },

  get outputSchema(): OutputSchema {
    return outputSchema();
  },

  userFacingName(): string {
    return '🖥️ Computer';
  },

  getToolUseSummary(input: Partial<Input> | undefined): string | null {
    if (!input?.action) return null;
    switch (input.action) {
      case 'screenshot':
        return 'Take screenshot';
      case 'left_click':
      case 'right_click':
      case 'double_click':
        return `${input.action.replace('_', ' ')} at (${input.coordinate?.join(', ') ?? '?'})`;
      case 'type':
        return `Type "${(input.text ?? '').substring(0, 30)}"`;
      case 'key':
        return `Press ${input.key}`;
      case 'mouse_move':
        return `Move to (${input.coordinate?.join(', ') ?? '?'})`;
      case 'scroll':
        return `Scroll ${input.scroll_direction ?? 'down'}`;
      case 'zoom':
        return `Zoom into region ${input.region?.join(', ') ?? '?'}`;
      case 'list_windows':
        return 'List open windows';
      case 'focus_window':
        return `Focus window "${input.window_query ?? '?'}"`;
      default:
        return input.action;
    }
  },

  getActivityDescription(input: Partial<Input> | undefined): string {
    if (!input?.action) return 'Using computer';
    switch (input.action) {
      case 'screenshot':
        return 'Taking screenshot';
      case 'left_click':
      case 'right_click':
      case 'double_click':
        return `Clicking at (${input.coordinate?.join(', ') ?? '?'})`;
      case 'type':
        return 'Typing text';
      case 'key':
        return `Pressing ${input.key ?? 'key'}`;
      case 'scroll':
        return `Scrolling ${input.scroll_direction ?? 'down'}`;
      case 'zoom':
        return 'Zooming into region';
      case 'list_windows':
        return 'Listing open windows';
      case 'focus_window':
        return `Focusing window "${input.window_query ?? '?'}"`;
      default:
        return `Performing ${input.action}`;
    }
  },

  async checkPermissions(input: Input) {
    // Computer use always requires explicit user approval
    return {
      behavior: 'ask' as const,
      message: `Computer Use: ${input.action}${input.coordinate ? ` at (${input.coordinate.join(', ')})` : ''}${input.text ? ` text="${input.text.substring(0, 50)}"` : ''}${input.key ? ` key="${input.key}"` : ''}${input.window_query ? ` window="${input.window_query}"` : ''}`,
    };
  },

  renderToolUseMessage(input: Partial<Input>, options: { theme: string; verbose: boolean }): React.ReactNode {
    if (!input.action) return React.createElement(Text, null, '🖥️ Computer Use');
    const parts = [`🖥️ ${input.action}`];
    if (input.coordinate) parts.push(`at (${input.coordinate.join(', ')})`);
    if (input.text) parts.push(`"${input.text.substring(0, 50)}"`);
    if (input.key) parts.push(input.key);
    if (input.scroll_direction) parts.push(input.scroll_direction);
    if (input.window_query) parts.push(`"${input.window_query}"`);
    if (input.region) parts.push(`[${input.region.join(', ')}]`);
    return React.createElement(Text, null, parts.join(' '));
  },

  mapToolResultToToolResultBlockParam(output: Out, toolUseID: string): ToolResultBlockParam {
    const content: ToolResultBlockParam['content'] = [];

    // Add screenshot as image block if present
    if (output.screenshot) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: output.screenshot,
        },
      });
    }

    // Add text result
    if (output.result) {
      content.push({
        type: 'text',
        text: output.result,
      });
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: content.length > 0 ? content : output.result,
    };
  },

  async call(input: any): Promise<{ data: Out }> {
    // Helper to normalize coordinates from various formats [x,y], {x,y}, "x,y"
    const normalizeCoord = (c: any): [number, number] | undefined => {
      if (!c) return undefined;
      if (Array.isArray(c) && c.length >= 2) return [Number(c[0]), Number(c[1])];
      if (typeof c === 'object') {
        const x = c.x ?? c.X ?? c.left ?? c.coordinate?.[0];
        const y = c.y ?? c.Y ?? c.top ?? c.coordinate?.[1];
        if (x !== undefined && y !== undefined) return [Number(x), Number(y)];
      }
      if (typeof c === 'string') {
        try {
          const p = JSON.parse(c);
          return normalizeCoord(p);
        } catch {
          const m = c.match(/\[?(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)\]?/);
          if (m) return [Number(m[1]), Number(m[2])];
        }
      }
      return undefined;
    };

    const action = String(input.action || '').toLowerCase();
    logForDebugging(`[ComputerUse] Action: ${action}`);

    const config = await getDisplayConfig();

    // Map input to ComputerToolInput with extreme normalization
    const toolInput: ComputerToolInput = {
      action: action as any,
      coordinate: normalizeCoord(input.coordinate),
      text: input.text !== null && input.text !== undefined ? String(input.text) : undefined,
      key: input.key !== null && input.key !== undefined ? String(input.key) : undefined,
      scroll_direction: input.scroll_direction ? (String(input.scroll_direction).toLowerCase() as any) : undefined,
      scroll_amount:
        input.scroll_amount !== undefined && input.scroll_amount !== null ? Number(input.scroll_amount) : undefined,
      start_coordinate: normalizeCoord(input.start_coordinate),
      duration: input.duration !== undefined && input.duration !== null ? Number(input.duration) : undefined,
      region: Array.isArray(input.region)
        ? [Number(input.region[0]), Number(input.region[1]), Number(input.region[2]), Number(input.region[3])]
        : undefined,
      window_query: input.window_query ? String(input.window_query) : undefined,
    };

    // Execute the action
    const results = await handleComputerAction(toolInput, config);

    // Extract results
    let textResult = '';
    let screenshotData: string | undefined;

    for (const block of results) {
      if (block.type === 'text') {
        textResult = block.text;
      } else if (block.type === 'image') {
        screenshotData = block.source.data;
      }
    }

    // Auto-screenshot after every action (except screenshot itself)
    if (action !== 'screenshot' && !screenshotData) {
      try {
        // Small delay to let the screen update
        await new Promise(resolve => setTimeout(resolve, 300));
        const { captureScreenshot } = await import('./screenshot.js');
        const ss = await captureScreenshot();
        screenshotData = ss.base64;
      } catch {
        // Screenshot after action is best-effort
      }
    }

    return {
      data: {
        result: textResult || `Action "${input.action}" completed`,
        screenshot: screenshotData,
      },
    };
  },
} satisfies ToolDef<InputSchema, Out>);
