import type * as React from 'react';
import { Box, Text } from '../../ink.js';
import { getGlobalConfig } from '../../utils/config.js';

export type ClawdPose =
  | 'default'
  | 'arms-up' // both arms raised (used during jump)
  | 'look-left' // both pupils shifted left
  | 'look-right'; // both pupils shifted right

type Props = {
  pose?: ClawdPose;
  showHorns?: boolean;
  /** Override body color (theme key or raw color string) */
  bodyColor?: string;
  /** Override eye color (theme key or raw color string) */
  eyeColor?: string;
};

// Standard-terminal pose fragments. Each row is split into segments so we can
// vary only the parts that change (eyes, arms) while keeping the body/bg spans
// stable. All poses end up 9 cols wide.
type Segments = {
  /** row 1 left (no bg): optional raised arm + side */
  r1L: string;
  /** row 1 eyes (with bg): left-eye, forehead, right-eye */
  r1E: string;
  /** row 1 right (no bg): side + optional raised arm */
  r1R: string;
  /** row 2 left (no bg): arm + body curve */
  r2L: string;
  /** row 2 right (no bg): body curve + arm */
  r2R: string;
};

const POSES: Record<ClawdPose, Segments> = {
  default: {
    r1L: ' ▐',
    r1E: '▛███▜',
    r1R: '▌',
    r2L: '▝▜',
    r2R: '▛▘',
  },
  'look-left': {
    r1L: ' ▐',
    r1E: '▟███▟',
    r1R: '▌',
    r2L: '▝▜',
    r2R: '▛▘',
  },
  'look-right': {
    r1L: ' ▐',
    r1E: '▙███▙',
    r1R: '▌',
    r2L: '▝▜',
    r2R: '▛▘',
  },
  'arms-up': {
    r1L: '▗▟',
    r1E: '▛███▜',
    r1R: '▙▖',
    r2L: ' ▜',
    r2R: '▛ ',
  },
};

// Apple Terminal uses a bg-fill trick (see below), so only eye poses make
// sense. Arm poses fall back to default.
const APPLE_EYES: Record<ClawdPose, string> = {
  default: ' ▗   ▖ ',
  'look-left': ' ▘   ▘ ',
  'look-right': ' ▝   ▝ ',
  'arms-up': ' ▗   ▖ ',
};


export function Clawd({ pose = 'default', showHorns, bodyColor, eyeColor }: Props = {}): React.ReactNode {
  const config = getGlobalConfig();
  const shouldShowHorns = showHorns ?? (config as any).showClawdHorns ?? true;
  const bc = bodyColor ?? (config as any).clawdBodyColor ?? 'clawd_body';
  const ec = eyeColor ?? (config as any).clawdEyeColor ?? 'clawd_eye';

  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} showHorns={shouldShowHorns} bodyColor={bc} eyeColor={ec} />;
  }

  const p = POSES[pose];
  const tHorn = shouldShowHorns ? <Text color={bc}>{'  ▗   ▖  '}</Text> : null;
  const t6 = (
    <Text>
      <Text color={bc}>{p.r1L}</Text>
      <Text color={bc} backgroundColor={(config as any).clawdEyeColor ? ec : 'clawd_background'}>
        {p.r1E}
      </Text>
      <Text color={bc}>{p.r1R}</Text>
    </Text>
  );
  const t10 = (
    <Text>
      <Text color={bc}>{p.r2L}</Text>
      <Text color={bc} backgroundColor={(config as any).clawdBodyColor ? bc : 'clawd_background'}>
        █████
      </Text>
      <Text color={bc}>{p.r2R}</Text>
    </Text>
  );
  const t11 = (
    <Text color={bc}>
      {'  '}▘▘ ▝▝{'  '}
    </Text>
  );

  return (
    <Box flexDirection="column">
      {tHorn}
      {t6}
      {t10}
      {t11}
    </Box>
  );
}

function AppleTerminalClawd({ pose, showHorns, bodyColor, eyeColor }: Props): React.ReactNode {
  const bc = bodyColor ?? 'clawd_body';
  const ec = eyeColor ?? 'clawd_eye';
  const tHorn = showHorns ? <Text color={bc}>{'  ▗   ▖  '}</Text> : null;
  const t2 = APPLE_EYES[pose];
  const t3 = (
    <Text color={ec} backgroundColor={bc}>
      {t2}
    </Text>
  );
  const t5 = (
    <Text>
      <Text color={bc}>▗</Text>
      {t3}
      <Text color={bc}>▖</Text>
    </Text>
  );
  const t6 = <Text backgroundColor={bc}>{' '.repeat(7)}</Text>;
  const t7 = <Text color={bc}>▘▘ ▝▝</Text>;

  return (
    <Box flexDirection="column" alignItems="center">
      {tHorn}
      {t5}
      {t6}
      {t7}
    </Box>
  );
}