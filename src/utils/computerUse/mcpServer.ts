/**
 * Computer Use MCP server — cross-platform implementation.
 * Replaces @ant/computer-use-mcp with our own PlatformAdapter-backed server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { shutdownDatadog } from '../../services/analytics/datadog.js';
import { shutdown1PEventLogging } from '../../services/analytics/firstPartyEventLogger.js';
import { initializeAnalyticsSink } from '../../services/analytics/sink.js';
import { enableConfigs } from '../config.js';
import { logForDebugging } from '../debug.js';
import { errorMessage } from '../errors.js';
import { buildComputerUseTools, getComputerUseHostAdapter } from './hostAdapter.js';

/**
 * Handle a tool call by dispatching to the PlatformAdapter.
 * Exported for use by wrapper.tsx's .call() override.
 */

/** Convert normalized (0-1) to pixel coordinates */
function normToPixel(val: number, dim: number): number {
  return Math.round(val * dim);
}

/** Store the last screenshot dims for coordinate conversion */
let lastScreenshotWidth = 1920;
let lastScreenshotHeight = 1080;

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<{
  content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>;
}> {
  const { adapter, coordinateMode, subGates } = getComputerUseHostAdapter();
  const toPixel = (x: number, y: number): [number, number] =>
    coordinateMode === 'normalized'
      ? [normToPixel(x, lastScreenshotWidth), normToPixel(y, lastScreenshotHeight)]
      : [x, y];

  try {
    switch (name) {
      case 'screenshot': {
        const result = await adapter.screenshot();
        lastScreenshotWidth = result.width;
        lastScreenshotHeight = result.height;
        const coordNote = coordinateMode === 'normalized' ? ' (normalized 0-1)' : ' (pixels)';
        return {
          content: [
            { type: 'image', data: result.base64, mimeType: 'image/jpeg' },
            { type: 'text', text: `Screenshot captured: ${result.width}x${result.height}${coordNote}` },
          ],
        };
      }

      case 'mouse_move': {
        const [mx, my] = toPixel(Number(args.x), Number(args.y));
        await adapter.mouseMove(mx, my);
        return { content: [{ type: 'text', text: `Mouse moved to (${mx}, ${my})` }] };
      }

      case 'click': {
        const button = (args.button as string) ?? 'left';
        const count = (Number(args.click_count) || 1) as 1 | 2 | 3;
        const [cx, cy] = toPixel(Number(args.x), Number(args.y));
        await adapter.click(cx, cy, button as any, count);
        return { content: [{ type: 'text', text: `Clicked ${button} at (${cx}, ${cy})` }] };
      }

      case 'drag': {
        const [sx, sy] = toPixel(Number(args.start_x), Number(args.start_y));
        const [ex, ey] = toPixel(Number(args.end_x), Number(args.end_y));
        await adapter.drag({ x: sx, y: sy }, { x: ex, y: ey });
        return {
          content: [{
            type: 'text',
            text: `Dragged from (${sx}, ${sy}) to (${ex}, ${ey})`,
          }],
        };
      }

      case 'scroll': {
        const [scx, scy] = toPixel(Number(args.x), Number(args.y));
        await adapter.mouseMove(scx, scy);
        await adapter.scroll(Number(args.scroll_x) || 0, Number(args.scroll_y) || 0);
        return { content: [{ type: 'text', text: `Scrolled at (${scx}, ${scy})` }] };
      }

      case 'key': {
        await adapter.keyPress(String(args.keys));
        return { content: [{ type: 'text', text: `Pressed key: ${args.keys}` }] };
      }

      case 'type': {
        await adapter.typeText(String(args.text));
        return { content: [{ type: 'text', text: `Typed text (${String(args.text).length} characters)` }] };
      }

      case 'cursor_position': {
        const pos = await adapter.getCursorPosition();
        return { content: [{ type: 'text', text: `Cursor at (${pos.x}, ${pos.y})` }] };
      }

      case 'list_displays': {
        const displays = await adapter.listDisplays();
        const lines = displays.map((d, i) => `${i}: ${d.width}x${d.height} (${d.name ?? 'unknown'})`);
        return { content: [{ type: 'text', text: `Displays:\n${lines.join('\n')}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logForDebugging(`[Computer Use MCP] ${name} error: ${errorMessage(error)}`);
    return { content: [{ type: 'text', text: `Error: ${errorMessage(error)}` }] };
  }
}

/**
 * Create the MCP server for Computer Use tools.
 */
export async function createComputerUseMcpServerForCli(): Promise<Server> {
  const { coordinateMode } = getComputerUseHostAdapter();
  const tools = buildComputerUseTools(coordinateMode);

  const server = new Server(
    { name: 'computer-use', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const result = await handleToolCall(req.params.name, req.params.arguments as Record<string, unknown> ?? {});
    return { content: result.content.map(c => ({
      type: c.type as any,
      text: c.text,
      data: c.data,
      mimeType: c.mimeType,
    })) };
  });

  return server;
}

/**
 * Subprocess entrypoint for `--computer-use-mcp`.
 */
export async function runComputerUseMcpServer(): Promise<void> {
  enableConfigs();
  initializeAnalyticsSink();

  const server = await createComputerUseMcpServerForCli();
  const transport = new StdioServerTransport();

  let exiting = false;
  const shutdownAndExit = async (): Promise<void> => {
    if (exiting) return;
    exiting = true;
    await Promise.all([shutdown1PEventLogging(), shutdownDatadog()]);
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0);
  };
  process.stdin.on('end', () => void shutdownAndExit());
  process.stdin.on('error', () => void shutdownAndExit());

  logForDebugging('[Computer Use MCP] Starting MCP server');
  await server.connect(transport);
  logForDebugging('[Computer Use MCP] MCP server started');
}
