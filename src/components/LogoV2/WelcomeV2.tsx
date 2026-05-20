import type React from 'react';
import { Box, Text, useTheme } from 'src/ink.js';
import { env } from '../../utils/env.js';

const WELCOME_V2_WIDTH = 58;
const CLAWD_PREFIX = '      ';
const CLAWD_ART_WIDTH = 9;
const CLAWD_SUFFIX_WIDTH =
  WELCOME_V2_WIDTH - CLAWD_PREFIX.length - CLAWD_ART_WIDTH;

const EMPTY_LINE = ' '.repeat(WELCOME_V2_WIDTH);
const DIVIDER_LINE = '…'.repeat(WELCOME_V2_WIDTH);
const CLAWD_SUFFIX = ' '.repeat(CLAWD_SUFFIX_WIDTH);
const TENTACLES = '▗▞▜ ▟▛ ▙▚▖';
const TENTACLE_TRAIL = '…'.repeat(
  WELCOME_V2_WIDTH - CLAWD_PREFIX.length - TENTACLES.length,
);

export function WelcomeV2(): React.ReactNode {
  const [theme] = useTheme();
  const welcomeMessage = 'Welcome to Ceph Code';

  if (env.terminal === 'Apple_Terminal') {
    return (
      <AppleTerminalWelcomeV2
        theme={theme}
        welcomeMessage={welcomeMessage}
      />
    );
  }

  return <WelcomeScene theme={theme} welcomeMessage={welcomeMessage} />;
}

type AppleTerminalWelcomeV2Props = {
  theme: string;
  welcomeMessage: string;
};

function AppleTerminalWelcomeV2({
  theme,
  welcomeMessage,
}: AppleTerminalWelcomeV2Props): React.ReactNode {
  return <WelcomeScene theme={theme} welcomeMessage={welcomeMessage} />;
}

type WelcomeSceneProps = {
  theme: string;
  welcomeMessage: string;
};

function WelcomeScene({
  theme,
  welcomeMessage,
}: WelcomeSceneProps): React.ReactNode {
  const isLightTheme = ['light', 'light-daltonized', 'light-ansi'].includes(
    theme,
  );

  if (isLightTheme) {
    return (
      <Box width={WELCOME_V2_WIDTH} flexDirection="column">
        <WelcomeHeader welcomeMessage={welcomeMessage} />
        <Text>{DIVIDER_LINE}</Text>
        <Text>{EMPTY_LINE}</Text>
        <Text>{EMPTY_LINE}</Text>
        <Text>{'            ░░░░░░                                        '}</Text>
        <Text>{'    ░░░   ░░░░░░░░░░                                      '}</Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░                                    '}</Text>
        <Text>{EMPTY_LINE}</Text>

        <Text>
          <Text dimColor>{'                           ░░░░'}</Text>
          <Text>{'                     ██    '}</Text>
        </Text>

        <Text>
          <Text dimColor>{'                         ░░░░░░░░░░'}</Text>
          <Text>{'               ██▒▒██  '}</Text>
        </Text>

        <Text>{'                                            ▒▒      ██   ▒'}</Text>

        <ClawdTop suffix="                         ▒▒░░▒▒      ▒ ▒▒  " />
        <ClawdBody suffix="                           ▒▒         ▒▒   " />
        <ClawdEyeEmpty suffix="                          ░          ▒     " />
        <ClawdEyePupil />
        <ClawdBody />
        <ClawdTentacles />
      </Box>
    );
  }

  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <WelcomeHeader welcomeMessage={welcomeMessage} />
      <Text>{DIVIDER_LINE}</Text>
      <Text>{EMPTY_LINE}</Text>
      <Text>{'     *                                       █████▓▓░     '}</Text>
      <Text>{'                                 *         ███▓░     ░░   '}</Text>
      <Text>{'            ░░░░░░                        ███▓░           '}</Text>
      <Text>{'    ░░░   ░░░░░░░░░░                      ███▓░           '}</Text>

      <Text>
        <Text>{'   ░░░░░░░░░░░░░░░░░░░    '}</Text>
        <Text bold>*</Text>
        <Text>{'                ██▓░░      ▓   '}</Text>
      </Text>

      <Text>{'                                             ░▓▓███▓▓░    '}</Text>
      <Text dimColor>{' *                                 ░░░░                   '}</Text>
      <Text dimColor>{'                                 ░░░░░░░░                 '}</Text>
      <Text dimColor>{'                               ░░░░░░░░░░░░░░░░           '}</Text>

      <ClawdTop suffix="                                       *   " />
      <ClawdBody suffix="                        *                  " />
      <ClawdEyeEmpty suffix="     *                                     " />
      <ClawdEyePupil />
      <ClawdBody />
      <ClawdTentacles />
    </Box>
  );
}

function WelcomeHeader({
  welcomeMessage,
}: {
  welcomeMessage: string;
}): React.ReactNode {
  return (
    <Text>
      <Text color="claude">{welcomeMessage} </Text>
      <Text dimColor>v{MACRO.VERSION} </Text>
    </Text>
  );
}

function ClawdTop({
  suffix = CLAWD_SUFFIX,
}: {
  suffix?: React.ReactNode;
}): React.ReactNode {
  return (
    <Text>
      {CLAWD_PREFIX}
      <Text color="clawd_body">{'  ▄▄▄▄▄  '}</Text>
      {suffix}
    </Text>
  );
}

function ClawdBody({
  suffix = CLAWD_SUFFIX,
}: {
  suffix?: React.ReactNode;
}): React.ReactNode {
  return (
    <Text>
      {CLAWD_PREFIX}
      <Text color="clawd_body">{'▐'}</Text>
      <Text color="clawd_body" backgroundColor="clawd_body">
        {'███████'}
      </Text>
      <Text color="clawd_body">{'▌'}</Text>
      {suffix}
    </Text>
  );
}

function ClawdEyeEmpty({
  suffix = CLAWD_SUFFIX,
}: {
  suffix?: React.ReactNode;
}): React.ReactNode {
  return (
    <Text>
      {CLAWD_PREFIX}
      <Text color="clawd_body">{'▐'}</Text>
      <Text color="clawd_body" backgroundColor="clawd_body">
        {'██'}
      </Text>
      <Text backgroundColor="clawd_background">{'   '}</Text>
      <Text color="clawd_body" backgroundColor="clawd_body">
        {'██'}
      </Text>
      <Text color="clawd_body">{'▌'}</Text>
      {suffix}
    </Text>
  );
}

function ClawdEyePupil({
  suffix = CLAWD_SUFFIX,
}: {
  suffix?: React.ReactNode;
}): React.ReactNode {
  return (
    <Text>
      {CLAWD_PREFIX}
      <Text color="clawd_body">{'▐'}</Text>
      <Text color="clawd_body" backgroundColor="clawd_body">
        {'██'}
      </Text>
      <Text color="clawd_eye" backgroundColor="clawd_background">
        {' ■ '}
      </Text>
      <Text color="clawd_body" backgroundColor="clawd_body">
        {'██'}
      </Text>
      <Text color="clawd_body">{'▌'}</Text>
      {suffix}
    </Text>
  );
}

function ClawdTentacles(): React.ReactNode {
  return (
    <Text>
      {CLAWD_PREFIX}
      <Text color="clawd_body">{TENTACLES}</Text>
      {TENTACLE_TRAIL}
    </Text>
  );
}