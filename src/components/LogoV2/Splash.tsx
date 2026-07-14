import { type ReactNode, useEffect, useState } from 'react';
import { Box, Text } from '../../ink.js';
import { getGlobalConfig } from '../../utils/config.js';

// Pinwheel / swirl brand mark for the startup splash. Full-cell blocks only
// (no background fill) so it renders identically across terminals; grid is
// pre-squashed horizontally to compensate for tall terminal cells.
const PINWHEEL: readonly string[] = [
  '          ███████          ',
  '       █████    █████      ',
  '    █ ████  ███████████    ',
  '   █  ███  ██         ██   ',
  '  ██  ██  ██  ████████  █  ',
  ' ███  ██  ██ █      ████   ',
  '  ███  ███  ███  ███  ███  ',
  '   ████      █ ██  ██  ███ ',
  '  █  ████████  ██  ██  ██  ',
  '   ██         ██  ███  █   ',
  '    ███████████  ████ █    ',
  '      █████    █████       ',
  '          ███████          ',
];

/**
 * Shows the pinwheel splash for `durationMs`, then renders `children` (the
 * REPL). When the timer fires the splash is replaced in the dynamic frame, so
 * Ink erases it — it never lands in scrollback.
 */
export function Splash({ children, durationMs = 2500 }: { children: ReactNode; durationMs?: number }): ReactNode {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Allow skipping the splash entirely (CI, tests, or user preference).
    if (process.env.CLEW_NO_SPLASH || durationMs <= 0) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setDone(true), durationMs);
    return () => clearTimeout(t);
  }, [durationMs]);

  if (done) return <>{children}</>;

  const config = getGlobalConfig();
  const blade = (config as any).clawdBodyColor ?? 'clawd_body';

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {PINWHEEL.map((row, i) => (
        <Text key={i} color={blade}>
          {row}
        </Text>
      ))}
      <Box marginTop={1} flexDirection="row" justifyContent="center">
        <Text bold={true}>Clew Code </Text>
        <Text dimColor={true}>"Never Broke Limit Again"</Text>
      </Box>
    </Box>
  );
}
