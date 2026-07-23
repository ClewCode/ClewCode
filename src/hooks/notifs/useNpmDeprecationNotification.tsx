import type { Notification } from 'src/context/notifications.js';
import { isInBundledMode } from 'src/utils/bundledMode.js';
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js';
import { getCurrentInstallationType } from 'src/utils/doctorDiagnostic.js';
import { isEnvTruthy } from 'src/utils/envUtils.js';
import { useStartupNotification } from './useStartupNotification.js';

const NPM_DEPRECATION_MESSAGE =
  'Clew Code has switched from npm to native installer. Run `clew install` or see https://clew-code.org for more options.';

// Only npm installs need to migrate. Native / package-manager / development /
// unknown installs get no nag — showing "switched from npm" to a native install
// is a false alarm.
const NPM_INSTALL_TYPES = new Set(['npm-global', 'npm-local']);

function currentVersion(): string {
  return typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown';
}

export function useNpmDeprecationNotification() {
  useStartupNotification(_temp);
}

async function _temp(): Promise<Notification | null> {
  if (isInBundledMode() || isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    return null;
  }

  const installationType = await getCurrentInstallationType();
  // (B) Only warn genuine npm installs.
  if (!NPM_INSTALL_TYPES.has(installationType)) {
    return null;
  }

  // (A) Show at most once per version — don't nag on every launch.
  const version = currentVersion();
  if (getGlobalConfig().npmDeprecationNoticeSeenVersion === version) {
    return null;
  }
  saveGlobalConfig(config =>
    config.npmDeprecationNoticeSeenVersion === version
      ? config
      : { ...config, npmDeprecationNoticeSeenVersion: version },
  );

  return {
    timeoutMs: 15000,
    key: 'npm-deprecation-warning',
    text: NPM_DEPRECATION_MESSAGE,
    color: 'warning',
    priority: 'high',
  };
}
