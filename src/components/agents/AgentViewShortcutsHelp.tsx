/**
 * AgentViewShortcutsHelp — Keyboard shortcuts cheatsheet overlay.
 * Shown when pressing '?' in agent view.
 */

import { Box, Text } from '../../ink.js';
import { Dialog } from '../design-system/Dialog.js';

type ShortcutEntry = { keys: string; action: string };

const SHORTCUTS: ShortcutEntry[] = [
  { keys: '↑ / ↓', action: 'Move between rows' },
  { keys: 'Enter', action: 'Attach to selected session / dispatch' },
  { keys: 'Space', action: 'Open/close peek panel' },
  { keys: 'Shift+Enter', action: 'Dispatch and attach immediately' },
  { keys: '→', action: 'Attach to selected session' },
  { keys: 'Alt+1 .. Alt+9', action: 'Attach to session 1-9 in current group' },
  { keys: 'Ctrl+T', action: 'Pin/unpin selected session' },
  { keys: 'Ctrl+R', action: 'Rename selected session' },
  { keys: 'Ctrl+S', action: 'Switch grouping (state / directory)' },
  { keys: 'Ctrl+G', action: 'Open dispatch prompt in $EDITOR' },
  { keys: 'Ctrl+X', action: 'Stop session (×2 to delete)' },
  { keys: 'l', action: 'Logout/stop selected session (×2 to confirm)' },
  { keys: 'Ctrl+C', action: 'Clear input (×2 to exit)' },
  { keys: 'Tab', action: 'Browse subagents / apply suggestion' },
  { keys: 'Shift+↑ / Shift+↓', action: 'Reorder selected session' },
  { keys: 'Esc', action: 'Close peek panel, clear input, or exit' },
  { keys: '/', action: 'Start dispatch (filter mode)' },
  { keys: 'f', action: 'Toggle filter text' },
  { keys: '?', action: 'Show/hide this help' },
];

export function AgentViewShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard Shortcuts" onCancel={onClose} hideInputGuide>
      <Box flexDirection="column" gap={0} padding={1}>
        {SHORTCUTS.map(({ keys, action }) => (
          <Box key={keys} flexDirection="row" gap={2} height={1}>
            <Box width={20} flexShrink={0}>
              <Text bold color="suggestion">
                {keys}
              </Text>
            </Box>
            <Text dimColor>{action}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>Press ? or Esc to close</Text>
        </Box>
      </Box>
    </Dialog>
  );
}
