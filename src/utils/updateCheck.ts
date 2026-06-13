import { getLatestVersion } from './autoUpdater.js';
import { isEnvTruthy } from './envUtils.js';
import { lt } from './semver.js';

export type UpdateCheckResult = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
};

let cachedResult: UpdateCheckResult | null = null;

/** Clears the cached update check result so the next call re-fetches from npm. */
export function clearUpdateCheckCache(): void {
  cachedResult = null;
}

/** Returns true if the update check should be skipped entirely. */
function shouldSkipUpdateCheck(): boolean {
  // Skip in CI environments
  if (isEnvTruthy(process.env.CI) || isEnvTruthy(process.env.GITHUB_ACTIONS)) {
    return true;
  }
  // Skip if user opted out
  if (isEnvTruthy(process.env.CLEW_NO_UPDATE_CHECK)) {
    return true;
  }
  // Skip in development (running via tsx/bun --watch)
  if (isEnvTruthy(process.env.CLEW_DEV) || process.argv.includes('--dev')) {
    return true;
  }
  return false;
}

/**
 * Checks if a newer version of clew-code is available on the npm registry.
 * Results are cached so repeated calls in the same process don't re-fetch.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (cachedResult) {
    return cachedResult;
  }

  const currentVersion = MACRO.VERSION;

  if (shouldSkipUpdateCheck()) {
    cachedResult = { hasUpdate: false, currentVersion, latestVersion: null };
    return cachedResult;
  }

  try {
    const latestVersion = await getLatestVersion('latest');
    if (!latestVersion) {
      cachedResult = { hasUpdate: false, currentVersion, latestVersion: null };
      return cachedResult;
    }

    const hasUpdate = lt(currentVersion, latestVersion);
    cachedResult = { hasUpdate, currentVersion, latestVersion };
  } catch {
    cachedResult = { hasUpdate: false, currentVersion, latestVersion: null };
  }

  return cachedResult;
}
