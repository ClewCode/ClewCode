// biome-ignore-all lint/suspicious/noEmptyBlockStatements: intentional noops for DCE stubs
// Extracted from REPL.tsx — feature-flagged conditional imports with bun:bundle DCE
import { feature } from 'bun:bundle';

export const useVoiceIntegration: typeof import('../../hooks/useVoiceIntegration.js').useVoiceIntegration = feature(
  'VOICE_MODE',
)
  ? require('../../hooks/useVoiceIntegration.js').useVoiceIntegration
  : () => ({
      stripTrailing: () => 0,
      handleKeyEvent: () => {},
      resetAnchor: () => {},
    });

export const VoiceKeybindingHandler: typeof import('../../hooks/useVoiceIntegration.js').VoiceKeybindingHandler =
  feature('VOICE_MODE') ? require('../../hooks/useVoiceIntegration.js').VoiceKeybindingHandler : () => null;

// @ts-expect-error - Phase2 missing module stub
export const useFrustrationDetection: typeof import('../../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection =
  // @ts-expect-error TS2367 intentional DCE
  'external' === 'ant'
    ? require('../../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection
    : () => ({ state: 'closed', handleTranscriptSelect: () => {} });

// @ts-expect-error - Phase2 missing module stub
export const useAntOrgWarningNotification: typeof import('../../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification =
  // @ts-expect-error TS2367 intentional DCE
  'external' === 'ant'
    ? require('../../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification
    : () => {};

export const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => { [k: string]: string } = feature('COORDINATOR_MODE')
  ? require('../../coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({});

export const proactiveModule = feature('KAIROS') ? require('../../proactive/index.js') : null;

export const PROACTIVE_NO_OP_SUBSCRIBE = (_cb: () => void) => () => {
  /* noop */
};
export const PROACTIVE_FALSE = () => false;
export const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false;

export const useProactive = feature('KAIROS') ? require('../../proactive/useProactive.js').useProactive : null;

export const useScheduledTasks = feature('AGENT_TRIGGERS')
  ? require('../../hooks/useScheduledTasks.js').useScheduledTasks
  : null;

export const WebBrowserPanelModule = feature('WEB_BROWSER_TOOL')
  ? // @ts-expect-error - Phase2: missing module stub
    (require('../../tools/WebBrowserTool/WebBrowserPanel.js') as typeof import('../../tools/WebBrowserTool/WebBrowserPanel.js'))
  : null;
