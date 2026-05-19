import * as React from 'react';
import { type ReactNode, useEffect } from 'react';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { stringWidth } from '../../ink/stringWidth.js';
import { Box, Text } from '../../ink.js';
import { useAppState } from '../../state/AppState.js';
import { getEffortSuffix } from '../../utils/effort.js';
import { truncate } from '../../utils/format.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { formatModelAndBilling, getLogoDisplayData, truncatePath } from '../../utils/logoV2Utils.js';
import { renderModelSetting } from '../../utils/model/model.js';
import { OffscreenFreeze } from '../OffscreenFreeze.js';
import { AnimatedClawd } from './AnimatedClawd.js';
import { Clawd } from './Clawd.js';
import { GuestPassesUpsell, incrementGuestPassesSeenCount, useShowGuestPassesUpsell } from './GuestPassesUpsell.js';
import {
  incrementOverageCreditUpsellSeenCount,
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
} from './OverageCreditUpsell.js';

const CLAWD_LOGO_HEIGHT = 6;
const CLAWD_LOGO_WIDTH = 10;
const LOGO_GAP = 2;
const LOGO_RESERVED_WIDTH = CLAWD_LOGO_WIDTH + LOGO_GAP + 3;

export function CondensedLogo(): ReactNode {
  const { columns } = useTerminalSize();
  const agent = useAppState(s => s.agent);
  const effortValue = useAppState(s => s.effortValue);
  const model = useMainLoopModel();

  const modelDisplayName = renderModelSetting(model).replace(/^[^:]+:\s*/, '');

  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData();

  // Prefer AppState.agent (set from --agent CLI flag) over settings.
  const agentName = agent ?? agentNameFromSettings;

  const showGuestPassesUpsell = useShowGuestPassesUpsell();
  const showOverageCreditUpsell = useShowOverageCreditUpsell();

  useEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount();
    }
  }, [showGuestPassesUpsell]);

  useEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount();
    }
  }, [showOverageCreditUpsell, showGuestPassesUpsell]);

  // Account for Clawd width + gap + safety padding.
  const textWidth = Math.max(columns - LOGO_RESERVED_WIDTH, 20);

  const versionPrefix = 'Ceph Code v';
  const truncatedVersion = truncate(version, Math.max(textWidth - versionPrefix.length, 6));

  const effortSuffix = getEffortSuffix(model, effortValue);

  const { shouldSplit, truncatedModel, truncatedBilling } = formatModelAndBilling(
    modelDisplayName + effortSuffix,
    billingType,
    textWidth,
  );

  const separator = ' · ';
  const atPrefix = '@';

  const cwdAvailableWidth = agentName
    ? textWidth - atPrefix.length - stringWidth(agentName) - separator.length
    : textWidth;

  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10));

  const logo = isFullscreenEnvEnabled() ? <AnimatedClawd /> : <Clawd />;

  return (
    <OffscreenFreeze>
      <Box flexDirection="row" gap={LOGO_GAP} alignItems="center">
        <Box height={CLAWD_LOGO_HEIGHT} flexShrink={0}>
          {logo}
        </Box>

        <Box flexDirection="column" flexShrink={1}>
          <Text>
            <Text bold>Ceph Code</Text> <Text dimColor>v{truncatedVersion}</Text>
          </Text>

          {shouldSplit ? (
            <>
              <Text dimColor>{truncatedModel}</Text>
              <Text dimColor>{truncatedBilling}</Text>
            </>
          ) : (
            <Text dimColor>
              {truncatedModel} · {truncatedBilling}
            </Text>
          )}

          <Text dimColor>{agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}</Text>

          {showGuestPassesUpsell && <GuestPassesUpsell />}

          {!showGuestPassesUpsell && showOverageCreditUpsell && <OverageCreditUpsell maxWidth={textWidth} twoLine />}
        </Box>
      </Box>
    </OffscreenFreeze>
  );
}
