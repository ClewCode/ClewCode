import { readScrollSpeedBase } from '../../components/ScrollKeybindingHandler.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

/**
 * /scroll-speed command — set the wheel scroll multiplier.
 *
 * Reads/writes CLEW_CODE_SCROLL_SPEED. The ScrollKeybindingHandler
 * already reads this env var at runtime.
 *
 * Usage:
 *   /scroll-speed        — show current speed
 *   /scroll-speed <1-20> — set speed
 *   /scroll-speed default — reset to 1
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<null> {
  const trimmed = args?.trim() ?? '';

  // Show current speed
  if (!trimmed) {
    const current = readScrollSpeedBase();
    onDone(`Current scroll speed: ${current} (range 1-20, default 1)`, { display: 'system' });
    return null;
  }

  // Reset to default
  if (trimmed.toLowerCase() === 'default' || trimmed.toLowerCase() === 'reset') {
    process.env.CLEW_CODE_SCROLL_SPEED = '';
    onDone('Scroll speed reset to default (1).', { display: 'system' });
    return null;
  }

  // Parse and validate
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 1 || n > 20) {
    onDone('Invalid speed. Usage: /scroll-speed <1-20> (or "default" to reset)', { display: 'system' });
    return null;
  }

  process.env.CLEW_CODE_SCROLL_SPEED = String(n);
  onDone(`Scroll speed set to ${n}.`, { display: 'system' });
  return null;
}
