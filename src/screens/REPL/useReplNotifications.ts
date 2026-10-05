import { useAutoModeUnavailableNotification } from 'src/hooks/notifs/useAutoModeUnavailableNotification.js';
import { useCanSwitchToExistingSubscription } from 'src/hooks/notifs/useCanSwitchToExistingSubscription.js';
import { useDeprecationWarningNotification } from 'src/hooks/notifs/useDeprecationWarningNotification.js';
import { useInstallMessages } from 'src/hooks/notifs/useInstallMessages.js';
import { useLspInitializationNotification } from 'src/hooks/notifs/useLspInitializationNotification.js';
import { useModelMigrationNotifications } from 'src/hooks/notifs/useModelMigrationNotifications.js';
import { useNpmDeprecationNotification } from 'src/hooks/notifs/useNpmDeprecationNotification.js';
import { usePluginAutoupdateNotification } from 'src/hooks/notifs/usePluginAutoupdateNotification.js';
import { usePluginInstallationStatus } from 'src/hooks/notifs/usePluginInstallationStatus.js';
import { useRateLimitWarningNotification } from 'src/hooks/notifs/useRateLimitWarningNotification.js';
import { useSettingsErrors } from 'src/hooks/notifs/useSettingsErrors.js';
import { useTeammateLifecycleNotification } from 'src/hooks/notifs/useTeammateShutdownNotification.js';
import { useChromeExtensionNotification } from 'src/hooks/useChromeExtensionNotification.js';
import { useClaudeCodeHintRecommendation } from 'src/hooks/useClaudeCodeHintRecommendation.js';
import { useLspPluginRecommendation } from 'src/hooks/useLspPluginRecommendation.js';
import { useOfficialMarketplaceNotification } from 'src/hooks/useOfficialMarketplaceNotification.js';
import { useAntOrgWarningNotification } from './featureFlags.js';

/**
 * All fire-and-forget notification/recommendation side-effect hooks the REPL
 * mounts. Returns the two recommendations that drive focused input dialogs.
 */
export function useReplNotifications(mainLoopModel: string): {
  lspRecommendation: ReturnType<typeof useLspPluginRecommendation>['recommendation'];
  handleLspResponse: ReturnType<typeof useLspPluginRecommendation>['handleResponse'];
  hintRecommendation: ReturnType<typeof useClaudeCodeHintRecommendation>['recommendation'];
  handleHintResponse: ReturnType<typeof useClaudeCodeHintRecommendation>['handleResponse'];
} {
  useModelMigrationNotifications();
  useCanSwitchToExistingSubscription();
  useAutoModeUnavailableNotification();
  usePluginInstallationStatus();
  usePluginAutoupdateNotification();
  useSettingsErrors();
  useRateLimitWarningNotification(mainLoopModel);
  useDeprecationWarningNotification(mainLoopModel);
  useNpmDeprecationNotification();
  useAntOrgWarningNotification();
  useInstallMessages();
  useChromeExtensionNotification();
  useOfficialMarketplaceNotification();
  useLspInitializationNotification();
  useTeammateLifecycleNotification();
  const lsp = useLspPluginRecommendation();
  const hint = useClaudeCodeHintRecommendation();
  return {
    lspRecommendation: lsp.recommendation,
    handleLspResponse: lsp.handleResponse,
    hintRecommendation: hint.recommendation,
    handleHintResponse: hint.handleResponse,
  };
}
