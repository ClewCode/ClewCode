/**
 * Computer Use Tool — Dual-Mode Tool Definition
 *
 * Generates the correct tool definition based on the active provider:
 *
 * - **Anthropic Mode**: Uses official `computer_20251124` schema-less tool type
 *   with beta header. This is what Claude was trained on.
 *
 * - **Generic Mode**: Uses a standard JSON schema tool definition that
 *   any OpenAI-compatible provider can understand.
 *
 * Both modes use the same action handler under the hood.
 *
 * Built from scratch by Dek1MillionToken. No @ant/* dependencies.
 */

import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';
import type { ComputerUseMode } from './types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComputerUseToolConfig {
  /** Which mode we're operating in */
  mode: ComputerUseMode;
  /** Tool name that Claude will use (differs per mode) */
  toolName: string;
  /** Tool definitions to inject into the API call */
  tools: Record<string, unknown>[];
  /** Beta headers to add (Anthropic mode only) */
  betas: string[];
}

// ── Tool Definition Builder ──────────────────────────────────────────────────

/**
 * Build the computer use tool configuration for the given provider.
 *
 * @param provider - The active provider ID
 * @param apiWidth - Scaled display width for the API
 * @param apiHeight - Scaled display height for the API
 * @returns Tool config with mode, tools array, and beta headers
 */
export function getComputerUseToolConfig(
  provider: ProviderId,
  apiWidth: number,
  apiHeight: number,
): ComputerUseToolConfig {
  if (provider === 'anthropic') {
    return buildAnthropicConfig(apiWidth, apiHeight);
  }
  return buildGenericConfig();
}

// ── Anthropic Mode ───────────────────────────────────────────────────────────

/**
 * Official Anthropic Computer Use tool.
 * Uses the schema-less `computer_20251124` type.
 * Requires beta header `computer-use-2025-11-24`.
 *
 * Ref: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
 */
function buildAnthropicConfig(apiWidth: number, apiHeight: number): ComputerUseToolConfig {
  return {
    mode: 'anthropic',
    toolName: 'computer',
    tools: [
      {
        type: 'computer_20251124',
        name: 'computer',
        display_width_px: apiWidth,
        display_height_px: apiHeight,
        display_number: 1,
      },
    ],
    betas: ['computer-use-2025-11-24'],
  };
}

// ── Generic Mode ─────────────────────────────────────────────────────────────

/**
 * Generic Computer Use tool definition.
 * Uses standard JSON schema that any OpenAI-compatible provider understands.
 * Models with vision capability can analyze screenshots and decide actions.
 */
function buildGenericConfig(): ComputerUseToolConfig {
  return {
    mode: 'generic',
    toolName: 'computer_use',
    tools: [
      {
        type: 'function',
        function: {
          name: 'computer_use',
          description: [
            'Control the computer screen to complete tasks.',
            'Available actions:',
            '- screenshot: Capture what is currently displayed on screen',
            '- left_click: Click at [x, y] coordinates',
            '- right_click: Right-click at [x, y] coordinates',
            '- double_click: Double-click at [x, y] coordinates',
            '- type: Type a text string',
            '- key: Press a key combination (e.g. "ctrl+s", "enter", "alt+f4")',
            '- mouse_move: Move cursor to [x, y] coordinates',
            '- scroll: Scroll up/down/left/right at [x, y]',
            '- left_click_drag: Drag from start_coordinate to coordinate',
            '- list_windows: List all open windows with titles and positions',
            '- focus_window: Bring a window to front by title query',
            '- wait: Wait for specified duration in seconds',
            '',
            'Always take a screenshot first to see what is on screen.',
            'Coordinates are in pixels relative to the top-left corner.',
          ].join('\n'),
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'screenshot',
                  'left_click',
                  'right_click',
                  'double_click',
                  'triple_click',
                  'middle_click',
                  'type',
                  'key',
                  'mouse_move',
                  'scroll',
                  'left_click_drag',
                  'left_mouse_down',
                  'left_mouse_up',
                  'hold_key',
                  'list_windows',
                  'focus_window',
                  'wait',
                ],
                description: 'The action to perform on the computer',
              },
              coordinate: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: 'Target [x, y] screen coordinates for click, move, and scroll actions',
              },
              text: {
                type: 'string',
                description: 'Text to type (required for "type" action)',
              },
              key: {
                type: 'string',
                description:
                  'Key or key combination to press, e.g. "ctrl+s", "enter", "alt+tab" (required for "key" action)',
              },
              scroll_direction: {
                type: 'string',
                enum: ['up', 'down', 'left', 'right'],
                description: 'Scroll direction (for "scroll" action)',
              },
              scroll_amount: {
                type: 'number',
                description: 'Number of scroll clicks, default 3 (for "scroll" action)',
              },
              start_coordinate: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: 'Starting [x, y] coordinates for drag (for "left_click_drag" action)',
              },
              duration: {
                type: 'number',
                description: 'Duration in seconds for "hold_key" or "wait" actions',
              },
              window_query: {
                type: 'string',
                description: 'Window title or ID to focus (for "focus_window" action)',
              },
            },
            required: ['action'],
          },
        },
      },
    ],
    betas: [],
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Check if a provider potentially supports computer use.
 * Requires vision capability for analyzing screenshots.
 */
export function isComputerUseCapable(provider: ProviderId): boolean {
  // Providers known to support vision-capable models
  const visionProviders: ProviderId[] = [
    'anthropic',
    'openai',
    'openrouter',
    'opencode',
    'opencode-go',
    'cline',
    'xai',
    'mistral',
    'deepseek',
  ];
  return visionProviders.includes(provider);
}
