import type * as React from 'react';
import { Box, Text } from '../../ink.js';
import { getGlobalConfig } from '../../utils/config.js';
import { env } from '../../utils/env.js';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: ClawdPose;
  showHorns?: boolean;
  /** Override body color (theme key or raw color string) */
  bodyColor?: string;
  /** Override eye color (theme key or raw color string) */
  eyeColor?: string;
};

type EyeLayout = {
  left: number;
  width: number;
  right: number;
};

const EYE_LAYOUTS: Record<ClawdPose, EyeLayout> = {
  default: {
    left: 1,
    width: 3,
    right: 1,
  },
  'look-left': {
    left: 0,
    width: 3,
    right: 2,
  },
  'look-right': {
    left: 2,
    width: 3,
    right: 0,
  },
  'arms-up': {
    left: 1,
    width: 3,
    right: 1,
  },
};

function Eye({ eye, bodyColor, eyeColor }: { eye: EyeLayout; bodyColor: string; eyeColor: string }): React.ReactNode {
  return (
    <>
      <Text backgroundColor={bodyColor}>{' '.repeat(eye.left)}</Text>
      <Text color={eyeColor} backgroundColor={bodyColor}>
        {'▄'.repeat(eye.width)}
      </Text>
      <Text backgroundColor={bodyColor}>{' '.repeat(eye.right)}</Text>
    </>
  );
}

export function Clawd({ pose = 'default', showHorns, bodyColor, eyeColor }: Props = {}): React.ReactNode {
  const config = getGlobalConfig();

  const shouldShowHorns = showHorns ?? (config as any).showClawdHorns ?? true;
  const bc = bodyColor ?? (config as any).clawdBodyColor ?? 'clawd_body';
  const ec = eyeColor ?? (config as any).clawdEyeColor ?? 'clawd_eye';

  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} showHorns={shouldShowHorns} bodyColor={bc} eyeColor={ec} />;
  }

  const eye = EYE_LAYOUTS[pose];

  const tHorn = shouldShowHorns ? <Text color={bc}>{'  ▗   ▖  '}</Text> : null;

  const tFace =
    pose === 'arms-up' ? (
      <Text>
        <Text color={bc}>▗▟</Text>
        <Eye eye={eye} bodyColor={bc} eyeColor={ec} />
        <Text color={bc}>▙▖</Text>
      </Text>
    ) : (
      <Text>
        <Text color={bc}> ▐</Text>
        <Eye eye={eye} bodyColor={bc} eyeColor={ec} />
        <Text color={bc}>▌ </Text>
      </Text>
    );

  const tBody =
    pose === 'arms-up' ? (
      <Text>
        <Text color={bc}> ▜</Text>
        <Text backgroundColor={bc}>{' '.repeat(5)}</Text>
        <Text color={bc}>▛ </Text>
      </Text>
    ) : (
      <Text>
        <Text color={bc}>▝▜</Text>
        <Text backgroundColor={bc}>{' '.repeat(5)}</Text>
        <Text color={bc}>▛▘</Text>
      </Text>
    );

  const tLegs = (
    <Text color={bc}>
      {'  '}▘▘ ▝▝{'  '}
    </Text>
  );

  return (
    <Box flexDirection="column">
      {tHorn}
      {tFace}
      {tBody}
      {tLegs}
    </Box>
  );
}

function AppleTerminalClawd({ pose = 'default', showHorns, bodyColor, eyeColor }: Props): React.ReactNode {
  const bc = bodyColor ?? 'clawd_body';
  const ec = eyeColor ?? 'clawd_eye';

  const eye = EYE_LAYOUTS[pose];

  const tHorn = showHorns ? <Text color={bc}>{'  ▗   ▖  '}</Text> : null;

  const tFace = (
    <Text>
      <Text color={bc}>▗</Text>
      <Eye eye={eye} bodyColor={bc} eyeColor={ec} />
      <Text color={bc}>▖</Text>
    </Text>
  );

  const tBody = <Text backgroundColor={bc}>{' '.repeat(7)}</Text>;
  const tLegs = <Text color={bc}>▘▘ ▝▝</Text>;

  return (
    <Box flexDirection="column" alignItems="center">
      {tHorn}
      {tFace}
      {tBody}
      {tLegs}
    </Box>
  );
}
