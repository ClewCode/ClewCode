import type * as React from 'react';
import { useState } from 'react';
import { readScrollSpeedBase } from '../../components/ScrollKeybindingHandler.js';
import { Box, Text, useInput } from '../../ink.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

const MIN_SPEED = 1;
const MAX_SPEED = 20;
const BAR_WIDTH = 20;

/**
 * Interactive scroll-speed selector.
 *
 * Renders a visual bar showing current setting.
 * Arrow keys adjust, Enter confirms, Esc/Escape reverts.
 */
function ScrollSpeedSelector({
  initialSpeed,
  onConfirm,
  onCancel,
}: {
  initialSpeed: number;
  onConfirm: (speed: number) => void;
  onCancel: () => void;
}) {
  const [speed, setSpeed] = useState(initialSpeed);

  useInput((input, key) => {
    if (key.return || input === '\r') {
      onConfirm(speed);
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.leftArrow || input === 'h') {
      setSpeed(s => Math.max(MIN_SPEED, s - 1));
      return;
    }
    if (key.rightArrow || input === 'l') {
      setSpeed(s => Math.min(MAX_SPEED, s + 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSpeed(s => Math.min(MAX_SPEED, s + 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSpeed(s => Math.max(MIN_SPEED, s - 1));
      return;
    }
  });

  const filled = Math.round((speed / MAX_SPEED) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const label = speed === 1 ? 'default' : `${speed}`;

  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Text bold>Scroll Speed</Text>
      <Box>
        <Text> </Text>
        <Text color="green">{'█'.repeat(filled)}</Text>
        <Text dimColor>{'░'.repeat(empty)}</Text>
        <Text> {label}</Text>
      </Box>
      <Box>
        <Text dimColor> ◄► adjust • Enter confirm • Esc cancel</Text>
      </Box>
    </Box>
  );
}

/**
 * /scroll-speed command — set the wheel scroll multiplier.
 *
 * Usage:
 *   /scroll-speed               — interactive mode (live preview)
 *   /scroll-speed <1-20>        — set directly
 *   /scroll-speed default|reset — reset to 1
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext,
  args: string,
): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? '';

  // Non-interactive: set from argument
  if (trimmed) {
    if (trimmed.toLowerCase() === 'default' || trimmed.toLowerCase() === 'reset') {
      process.env.CLEW_CODE_SCROLL_SPEED = '';
      onDone(`Scroll speed reset to default (1).`, { display: 'system' });
      return null;
    }

    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n) || n < MIN_SPEED || n > MAX_SPEED) {
      onDone(`Invalid speed. Usage: /scroll-speed <${MIN_SPEED}-${MAX_SPEED}> (or "default" to reset)`, {
        display: 'system',
      });
      return null;
    }

    process.env.CLEW_CODE_SCROLL_SPEED = String(n);
    const label = n === 1 ? ' (default)' : '';
    onDone(`Scroll speed set to ${n}${label}.`, { display: 'system' });
    return null;
  }

  // Interactive mode
  const current = readScrollSpeedBase();

  return (
    <ScrollSpeedSelector
      initialSpeed={current}
      onConfirm={(speed: number) => {
        process.env.CLEW_CODE_SCROLL_SPEED = speed === 1 ? '' : String(speed);
        const label = speed === 1 ? ' (default)' : '';
        onDone(`Scroll speed set to ${speed}${label}.`, { display: 'system' });
      }}
      onCancel={() => {
        onDone('Scroll speed unchanged.', { display: 'system' });
      }}
    />
  );
}
