import { feature } from 'bun:bundle';
import type * as React from 'react';
import { Box, Text } from '../ink.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import {
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
} from '../services/compact/autoCompact.js';
import { useCompactWarningSuppression } from '../services/compact/compactWarningHook.js';
import { getUpgradeMessage } from '../utils/model/contextWindowUpgradeCheck.js';
import { type ContextMeterMode, formatContextMeter } from './contextMeter.js';

type Props = {
  tokenUsage: number;
  model: string;
  messages?: any[];
};

export function TokenWarning({ tokenUsage, model, messages }: Props): React.ReactNode {
  // Pass messages so the readout honors the adaptive threshold rather than the
  // static buffer — otherwise the displayed percentage disagrees with the point
  // auto-compact actually fires.
  const { percentLeft, isAboveWarningThreshold, isAboveErrorThreshold } = calculateTokenWarningState(tokenUsage, model);
  const autoCompactThreshold = getAutoCompactThreshold(model);

  // Use reactive hook to check if warning should be suppressed
  const suppressWarning = useCompactWarningSuppression();

  if (!isAboveWarningThreshold || suppressWarning) {
    return null;
  }

  const showAutoCompactWarning = isAutoCompactEnabled();
  const upgradeMessage = getUpgradeMessage('warning');

  // Reactive-only mode: proactive autocompact never fires, so percentLeft's
  // normal calculation (against the autocompact threshold) counts down to an
  // event that won't happen. Recompute against the effective window so the
  // percentage is honest.
  let displayPercentLeft = percentLeft;
  let reactiveOnlyMode = false;
  if (feature('REACTIVE_COMPACT')) {
    if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)) {
      reactiveOnlyMode = true;
    }
  }
  if (reactiveOnlyMode) {
    const effectiveWindow = getEffectiveContextWindowSize(model);
    displayPercentLeft = Math.max(0, Math.round(((effectiveWindow - tokenUsage) / effectiveWindow) * 100));
  }

  // Tokens remaining against whatever budget actually governs this session:
  // the (adaptive) auto-compact threshold normally, the full effective window
  // when proactive compaction is suppressed.
  const budget =
    showAutoCompactWarning && !reactiveOnlyMode ? autoCompactThreshold : getEffectiveContextWindowSize(model);
  const tokensLeft = Math.max(0, budget - tokenUsage);

  // Background pre-compaction is gone: auto-compact v2 runs its cheap reducers
  // inline (they cost no API call), so there is no long-running job to warn
  // about or to report as "ready".
  const mode: ContextMeterMode = reactiveOnlyMode
    ? { kind: 'reactive-only' }
    : showAutoCompactWarning
      ? { kind: 'auto-compact', backgroundRunning: false, backgroundReady: false }
      : { kind: 'manual' };

  return (
    <Box flexDirection="column" gap={0} marginTop={1}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text bold color={isAboveErrorThreshold ? 'error' : 'warning'}>
          {formatContextMeter({ percentLeft: displayPercentLeft, tokensLeft, mode })}
        </Text>
      </Box>
      {upgradeMessage ? (
        <Box marginTop={0}>
          <Text dimColor>{upgradeMessage}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
