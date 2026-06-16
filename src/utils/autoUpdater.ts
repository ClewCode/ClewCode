import { constants as fsConstants } from 'fs';
import { access, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join, posix, win32 } from 'path';
import { getDynamicConfig_BLOCKS_ON_INIT } from 'src/services/analytics/growthbook.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { MACRO } from '../main.js';
import { type ReleaseChannel, saveGlobalConfig } from './config.js';
import { logForDebugging } from './debug.js';
import { env } from './env.js';
import { getClaudeConfigHomeDir } from './envUtils.js';
import { ClaudeError, getErrnoCode, isENOENT } from './errors.js';
import { execFileNoThrowWithCwd } from './execFileNoThrow.js';
import { getFsImplementation } from './fsOperations.js';
import { gracefulShutdownSync } from './gracefulShutdown.js';
import { logError } from './log.js';
import { getPlatform } from './platform.js';
import { gte, lt } from './semver.js';
import { getInitialSettings } from './settings/settings.js';
import { filterClaudeAliases, getShellConfigPaths, readFileLines, writeFileLines } from './shellConfig.js';
import { sleep } from './sleep.js';
import { jsonParse } from './slowOperations.js';

class AutoUpdaterError extends ClaudeError {}

export type InstallStatus = 'success' | 'no_permissions' | 'install_failed' | 'in_progress';

export type AutoUpdaterResult = {
  version: string | null;
  status: InstallStatus;
  notifications?: string[];
};

export type MaxVersionConfig = {
  external?: string;
  ant?: string;
  external_message?: string;
  ant_message?: string;
};

/**
 * Categories of update failures for structured error reporting.
 */
export type UpdateErrorCategory = 'network' | 'permissions' | 'registry' | 'lock_contention' | 'platform' | 'unknown';

/**
 * Classifies an error into a category and extracts the OS error code if available.
 */
export function classifyUpdateError(error: unknown): {
  category: UpdateErrorCategory;
  osCode: string | null;
  message: string;
} {
  const msg = String(error);
  const err = error as Record<string, unknown> | null | undefined;

  // OS error code (EACCES, ENOENT, ECONNREFUSED, etc.)
  const osCode =
    (typeof err?.code === 'string' ? err.code : null) ??
    (typeof (error as Error)?.message === 'string' ? extractErrno((error as Error).message) : null);

  if (osCode === 'EACCES' || osCode === 'EPERM') {
    return { category: 'permissions', osCode, message: msg };
  }
  if (osCode === 'ECONNREFUSED' || osCode === 'ECONNRESET' || osCode === 'ENOTFOUND' || osCode === 'ETIMEDOUT') {
    return { category: 'network', osCode, message: msg };
  }
  if (osCode === 'EAI_AGAIN') {
    return { category: 'network', osCode, message: msg };
  }
  if (osCode === 'EEXIST') {
    return { category: 'lock_contention', osCode, message: msg };
  }
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('socket')
  ) {
    return { category: 'network', osCode, message: msg };
  }
  if (msg.includes('permission') || msg.includes('EACCES') || msg.includes('EPERM')) {
    return { category: 'permissions', osCode, message: msg };
  }
  if (msg.includes('registry') || msg.includes('npm') || msg.includes('dist-tags')) {
    return { category: 'registry', osCode, message: msg };
  }
  return { category: 'unknown', osCode, message: msg };
}

function extractErrno(msg: string): string | null {
  const m = msg.match(/(E[A-Z]+)/);
  return m?.[1] ?? null;
}

/**
 * Checks if the current version meets the minimum required version from Statsig config
 * Terminates the process with an error message if the version is too old
 *
 * NOTE ON SHA-BASED VERSIONING:
 * We use SemVer-compliant versioning with build metadata format (X.X.X+SHA) for continuous deployment.
 * According to SemVer specs, build metadata (the +SHA part) is ignored when comparing versions.
 *
 * Versioning approach:
 * 1. For version requirements/compatibility (assertMinVersion), we use semver comparison that ignores build metadata
 * 2. For updates ('claude update'), we use exact string comparison to detect any change, including SHA
 *    - This ensures users always get the latest build, even when only the SHA changes
 *    - The UI clearly shows both versions including build metadata
 *
 * This approach keeps version comparison logic simple while maintaining traceability via the SHA.
 */
export async function assertMinVersion(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    const versionConfig = await getDynamicConfig_BLOCKS_ON_INIT<{
      minVersion: string;
    }>('tengu_version_config', { minVersion: '0.0.0' });

    if (versionConfig.minVersion && lt(MACRO.VERSION, versionConfig.minVersion)) {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.error(`
It looks like your version of Clew Code (${MACRO.VERSION}) needs an update.
A newer version (${versionConfig.minVersion} or higher) is required to continue.

To update, please run:
    clew update

This will ensure you have access to the latest features and improvements.
`);
      gracefulShutdownSync(1);
    }
  } catch (error) {
    logError(error as Error);
  }
}

/**
 * Returns the maximum allowed version for the current user type.
 * For ants, returns the `ant` field (dev version format).
 * For external users, returns the `external` field (clean semver).
 * This is used as a server-side kill switch to pause auto-updates during incidents.
 * Returns undefined if no cap is configured.
 */
export async function getMaxVersion(): Promise<string | undefined> {
  const config = await getMaxVersionConfig();
  if (process.env.USER_TYPE === 'ant') {
    return config.ant || undefined;
  }
  return config.external || undefined;
}

/**
 * Returns the server-driven message explaining the known issue, if configured.
 * Shown in the warning banner when the current version exceeds the max allowed version.
 */
export async function getMaxVersionMessage(): Promise<string | undefined> {
  const config = await getMaxVersionConfig();
  if (process.env.USER_TYPE === 'ant') {
    return config.ant_message || undefined;
  }
  return config.external_message || undefined;
}

async function getMaxVersionConfig(): Promise<MaxVersionConfig> {
  try {
    return await getDynamicConfig_BLOCKS_ON_INIT<MaxVersionConfig>('tengu_max_version_config', {});
  } catch (error) {
    logError(error as Error);
    return {};
  }
}

/**
 * Checks if a target version should be skipped due to user's minimumVersion setting.
 * This is used when switching to stable channel - the user can choose to stay on their
 * current version until stable catches up, preventing downgrades.
 */
export function shouldSkipVersion(targetVersion: string): boolean {
  const settings = getInitialSettings();
  const minimumVersion = settings?.minimumVersion;
  if (!minimumVersion) {
    return false;
  }
  // Skip if target version is less than minimum
  const shouldSkip = !gte(targetVersion, minimumVersion);
  if (shouldSkip) {
    logForDebugging(`Skipping update to ${targetVersion} - below minimumVersion ${minimumVersion}`);
  }
  return shouldSkip;
}

// Lock file for auto-updater to prevent concurrent updates
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout for locks

/**
 * Get the path to the lock file
 * This is a function to ensure it's evaluated at runtime after test setup
 */
export function getLockFilePath(): string {
  return join(getClaudeConfigHomeDir(), '.update.lock');
}

/**
 * Attempts to acquire a lock for auto-updater
 * @returns true if lock was acquired, false if another process holds the lock
 */
async function acquireLock(): Promise<boolean> {
  const fs = getFsImplementation();
  const lockPath = getLockFilePath();

  // Check for existing lock: 1 stat() on the happy path (fresh lock or ENOENT),
  // 2 on stale-lock recovery (re-verify staleness immediately before unlink).
  try {
    const stats = await fs.stat(lockPath);
    const age = Date.now() - stats.mtimeMs;
    if (age < LOCK_TIMEOUT_MS) {
      return false;
    }
    // Lock is stale, remove it before taking over. Re-verify staleness
    // immediately before unlinking to close a TOCTOU race: if two processes
    // both observe the stale lock, A unlinks + writes a fresh lock, then B
    // would unlink A's fresh lock and both believe they hold it. A fresh
    // lock has a recent mtime, so re-checking staleness makes B back off.
    try {
      const recheck = await fs.stat(lockPath);
      if (Date.now() - recheck.mtimeMs < LOCK_TIMEOUT_MS) {
        return false;
      }
      await fs.unlink(lockPath);
    } catch (err) {
      if (!isENOENT(err)) {
        logError(err as Error);
        return false;
      }
    }
  } catch (err) {
    if (!isENOENT(err)) {
      logError(err as Error);
      return false;
    }
    // ENOENT: no lock file, proceed to create one
  }

  // Create lock file atomically with O_EXCL (flag: 'wx'). If another process
  // wins the race and creates it first, we get EEXIST and back off.
  // Lazy-mkdir the config dir on ENOENT.
  try {
    await writeFile(lockPath, `${process.pid}`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    return true;
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === 'EEXIST') {
      return false;
    }
    if (code === 'ENOENT') {
      try {
        // fs.mkdir from getFsImplementation() is always recursive:true and
        // swallows EEXIST internally, so a dir-creation race cannot reach the
        // catch below — only writeFile's EEXIST (true lock contention) can.
        await fs.mkdir(getClaudeConfigHomeDir());
        await writeFile(lockPath, `${process.pid}`, {
          encoding: 'utf8',
          flag: 'wx',
        });
        return true;
      } catch (mkdirErr) {
        if (getErrnoCode(mkdirErr) === 'EEXIST') {
          return false;
        }
        logError(mkdirErr as Error);
        return false;
      }
    }
    logError(err as Error);
    return false;
  }
}

/**
 * Releases the update lock if it's held by this process
 */
async function releaseLock(): Promise<void> {
  const fs = getFsImplementation();
  const lockPath = getLockFilePath();
  try {
    const lockData = await fs.readFile(lockPath, { encoding: 'utf8' });
    if (lockData === `${process.pid}`) {
      await fs.unlink(lockPath);
    }
  } catch (err) {
    if (isENOENT(err)) {
      return;
    }
    logError(err as Error);
  }
}

async function getInstallationPrefix(): Promise<string | null> {
  const prefixResult = await execFileNoThrowWithCwd('npm', ['-g', 'config', 'get', 'prefix'], {
    cwd: homedir(),
  });
  if (prefixResult.code !== 0) {
    logError(new Error('Failed to check npm permissions'));
    return null;
  }
  return prefixResult.stdout.trim();
}

export async function checkGlobalInstallPermissions(): Promise<{
  hasPermissions: boolean;
  npmPrefix: string | null;
}> {
  try {
    const prefix = await getInstallationPrefix();
    if (!prefix) {
      return { hasPermissions: false, npmPrefix: null };
    }

    try {
      await access(prefix, fsConstants.W_OK);
      return { hasPermissions: true, npmPrefix: prefix };
    } catch {
      logError(new AutoUpdaterError('Insufficient permissions for global npm install.'));
      return { hasPermissions: false, npmPrefix: prefix };
    }
  } catch (error) {
    logError(error as Error);
    return { hasPermissions: false, npmPrefix: null };
  }
}

export async function getLatestVersion(channel: ReleaseChannel): Promise<string | null> {
  const npmTag = channel === 'stable' ? 'stable' : 'latest';
  const maxRetries = 2;
  const baseDelay = 1000;

  // Strategy 1: Try npm view first (original behavior)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Run from home directory to avoid reading project-level .npmrc
    // which could be maliciously crafted to redirect to an attacker's registry
    const result = await execFileNoThrowWithCwd(
      'npm',
      ['view', `${MACRO.PACKAGE_URL}@${npmTag}`, 'version', '--prefer-online'],
      { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
    );
    if (result.code === 0) {
      return result.stdout.trim();
    }

    const category = classifyUpdateError(result.stderr || result.stdout);
    logForDebugging(
      `npm view failed (attempt ${attempt + 1}/${maxRetries + 1}): ${category.category}${category.osCode ? ` (${category.osCode})` : ''}`,
    );
    if (result.stderr) {
      logForDebugging(`npm stderr: ${result.stderr.trim()}`);
    }
    if (result.stdout) {
      logForDebugging(`npm stdout: ${result.stdout.trim()}`);
    }

    // Don't retry permission errors — they're not transient
    if (category.category === 'permissions') {
      break;
    }

    if (attempt < maxRetries) {
      await sleep(baseDelay * (attempt + 1));
    }
  }

  // Strategy 2: If running on Bun, try bun x npm as fallback
  if (env.isRunningWithBun()) {
    logForDebugging('npm view failed, trying bun x npm as fallback');
    try {
      const bunResult = await execFileNoThrowWithCwd(
        'bun',
        ['x', 'npm', 'view', `${MACRO.PACKAGE_URL}@${npmTag}`, 'version', '--prefer-online'],
        { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
      );
      if (bunResult.code === 0) {
        return bunResult.stdout.trim();
      }
      logForDebugging(`bun x npm view failed: ${bunResult.stderr || bunResult.stdout}`);
    } catch (error) {
      logForDebugging(`bun x npm view threw: ${error}`);
    }
  }

  // Strategy 3: HTTP fallback — fetch directly from npm registry API
  // This works without npm or bun CLI tools
  logForDebugging('npm/bun view failed, trying HTTP registry API fallback');
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(MACRO.PACKAGE_URL)}/${encodeURIComponent(npmTag)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = (await response.json()) as { version?: string };
      if (data?.version) {
        logForDebugging(`HTTP registry API returned version: ${data.version}`);
        return data.version;
      }
    }
    logForDebugging(`HTTP registry API failed: ${response.status} ${response.statusText}`);
  } catch (error) {
    logForDebugging(`HTTP registry API threw: ${error}`);
  }

  return null;
}

export type NpmDistTags = {
  latest: string | null;
  stable: string | null;
};

/**
 * Get npm dist-tags (latest and stable versions) from the registry.
 * This is used by the doctor command to show users what versions are available.
 */
export async function getNpmDistTags(): Promise<NpmDistTags> {
  // Create a helper to parse dist-tags JSON
  function parseDistTags(json: string): NpmDistTags {
    try {
      const parsed = jsonParse(json.trim()) as Record<string, unknown>;
      return {
        latest: typeof parsed.latest === 'string' ? parsed.latest : null,
        stable: typeof parsed.stable === 'string' ? parsed.stable : null,
      };
    } catch (error) {
      logForDebugging(`Failed to parse dist-tags: ${error}`);
      return { latest: null, stable: null };
    }
  }

  // Strategy 1: Try npm view (original behavior)
  // Run from home directory to avoid reading project-level .npmrc
  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', MACRO.PACKAGE_URL, 'dist-tags', '--json', '--prefer-online'],
    { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
  );

  if (result.code === 0 && result.stdout) {
    return parseDistTags(result.stdout);
  }
  logForDebugging(`npm view dist-tags failed with code ${result.code}`);

  // Strategy 2: If running on Bun, try bun x npm as fallback
  if (env.isRunningWithBun()) {
    logForDebugging('npm dist-tags failed, trying bun x npm as fallback');
    try {
      const bunResult = await execFileNoThrowWithCwd(
        'bun',
        ['x', 'npm', 'view', MACRO.PACKAGE_URL, 'dist-tags', '--json', '--prefer-online'],
        { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
      );
      if (bunResult.code === 0 && bunResult.stdout) {
        return parseDistTags(bunResult.stdout);
      }
      logForDebugging(`bun x npm dist-tags failed: ${bunResult.stderr || bunResult.stdout}`);
    } catch (error) {
      logForDebugging(`bun x npm dist-tags threw: ${error}`);
    }
  }

  // Strategy 3: HTTP fallback — fetch directly from npm registry API
  logForDebugging('npm/bun dist-tags failed, trying HTTP registry API fallback');
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(MACRO.PACKAGE_URL)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = (await response.json()) as { 'dist-tags'?: Record<string, string> };
      if (data?.['dist-tags']) {
        logForDebugging(`HTTP registry API returned dist-tags`);
        return {
          latest: data['dist-tags'].latest ?? null,
          stable: data['dist-tags'].stable ?? null,
        };
      }
    }
    logForDebugging(`HTTP registry API failed: ${response.status}`);
  } catch (error) {
    logForDebugging(`HTTP registry API threw: ${error}`);
  }

  return { latest: null, stable: null };
}

/**
 * Get the latest version from npm registry for a given release channel.
 * Delegates to npm view (same as getLatestVersion).
 */
export async function getLatestVersionFromGcs(channel: ReleaseChannel): Promise<string | null> {
  return getLatestVersion(channel);
}

/**
 * Get available versions from npm registry (for all installations).
 * Uses npm dist-tags directly.
 */
export async function getGcsDistTags(): Promise<NpmDistTags> {
  return getNpmDistTags();
}

/**
 * Get version history from npm registry (ant-only feature)
 * Returns versions sorted newest-first, limited to the specified count
 *
 * Uses NATIVE_PACKAGE_URL when available because:
 * 1. Native installation is the primary installation method for ant users
 * 2. Not all JS package versions have corresponding native packages
 * 3. This prevents rollback from listing versions that don't have native binaries
 */
export async function getVersionHistory(limit: number): Promise<string[]> {
  if (process.env.USER_TYPE !== 'ant') {
    return [];
  }

  // Use native package URL when available to ensure we only show versions
  // that have native binaries (not all JS package versions have native builds)
  const packageUrl = MACRO.NATIVE_PACKAGE_URL ?? MACRO.PACKAGE_URL;

  // Run from home directory to avoid reading project-level .npmrc
  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', packageUrl, 'versions', '--json', '--prefer-online'],
    // Longer timeout for version list
    { abortSignal: AbortSignal.timeout(30000), cwd: homedir() },
  );

  if (result.code !== 0) {
    logForDebugging(`npm view versions failed with code ${result.code}`);
    if (result.stderr) {
      logForDebugging(`npm stderr: ${result.stderr.trim()}`);
    }
    return [];
  }

  try {
    const allVersions = jsonParse(result.stdout.trim()) as string[];
    const currentVersion = MACRO.VERSION;

    // Filter out versions that would cause rollback to pre-2.0 versions
    // This prevents users from accidentally downgrading to unsupported legacy versions
    const safeVersions = allVersions.filter(version => {
      // Simple semantic version comparison - reject versions starting with 0.x or 1.x
      const major = parseInt(version.split('.')[0], 10);
      return major >= 2;
    });

    // Take last N versions, then reverse to get newest first
    return safeVersions.slice(-limit).reverse();
  } catch (error) {
    logForDebugging(`Failed to parse version history: ${error}`);
    return [];
  }
}

/**
 * Detect which package manager (npm or bun) manages the current global installation.
 * Checks the invoked binary path against known global install directories rather than
 * relying on the runtime (a bun-compiled binary may be installed via npm global).
 */
function detectGlobalPackageManager(): 'npm' | 'bun' {
  let invokedPath = process.argv[1] || '';
  let execPath = process.execPath || process.argv[0] || '';
  let argv0 = process.argv[0] || '';

  // Normalize backslashes to forward slashes on Windows
  if (getPlatform() === 'windows') {
    invokedPath = invokedPath.split(win32.sep).join(posix.sep);
    execPath = execPath.split(win32.sep).join(posix.sep);
    argv0 = argv0.split(win32.sep).join(posix.sep);
  }

  const pathsToCheck = [invokedPath, execPath, argv0];

  if (getPlatform() === 'windows') {
    // bun global: .bun/bin/ is bun's primary bin link location on Windows
    // ponytail: global lock, per-path detection if mixed installs matter
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      const normalizedUserPath = userProfile.split(win32.sep).join(posix.sep);
      if (pathsToCheck.some(p => p.startsWith(normalizedUserPath + '/.bun/bin/'))) {
        return 'bun';
      }
      // %USERPROFILE%/node_modules/ is bun's global install dir on Windows
      // (npm uses %APPDATA%/npm/node_modules/), but only match if no npm path detected
      if (pathsToCheck.some(p => p.startsWith(normalizedUserPath + '/node_modules/'))) {
        // Check if any path also matches npm's global dir — if so, npm takes priority
        const appData = process.env.APPDATA;
        const normalizedAppData = appData ? appData.split(win32.sep).join(posix.sep) : '';
        const hasNpmPath = normalizedAppData && pathsToCheck.some(p => p.startsWith(normalizedAppData + '/npm/'));
        if (!hasNpmPath) {
          return 'bun';
        }
      }
    }
    // npm global: %APPDATA%/npm/node_modules/
    const appData = process.env.APPDATA;
    if (appData) {
      const normalizedAppData = appData.split(win32.sep).join(posix.sep);
      if (pathsToCheck.some(p => p.startsWith(normalizedAppData + '/npm/'))) {
        return 'npm';
      }
    }
  } else {
    // bun global: check ~/.bun/bin (bun's primary bin link location on macOS/Linux)
    const home = homedir();
    if (home && pathsToCheck.some(p => p.startsWith(`${home}/.bun/`))) {
      return 'bun';
    }
    // macOS/Linux npm global paths
    const npmGlobalPaths = [
      '/usr/local/lib/node_modules',
      '/usr/lib/node_modules',
      '/opt/homebrew/lib/node_modules',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ];
    if (pathsToCheck.some(p => npmGlobalPaths.some(prefix => p.startsWith(prefix)))) {
      return 'npm';
    }
    if (pathsToCheck.some(p => p.includes('/npm/') || p.includes('/nvm/'))) {
      return 'npm';
    }
  }

  // Fallback: use runtime detection
  return env.isRunningWithBun() ? 'bun' : 'npm';
}

export async function installGlobalPackage(specificVersion?: string | null): Promise<InstallStatus> {
  if (!(await acquireLock())) {
    logError(new AutoUpdaterError('Another process is currently installing an update'));
    // Log the lock contention
    logEvent('tengu_auto_updater_lock_contention', {
      pid: process.pid,
      currentVersion: MACRO.VERSION as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    return 'in_progress';
  }

  try {
    await removeClaudeAliasesFromShellConfigs();
    // Check if we're using npm from Windows path in WSL
    if (!env.isRunningWithBun() && env.isNpmFromWindowsPath()) {
      logError(new Error('Windows NPM detected in WSL environment'));
      logEvent('tengu_auto_updater_windows_npm_in_wsl', {
        currentVersion: MACRO.VERSION as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.error(`
Error: Windows NPM detected in WSL

You're running Clew Code in WSL but using the Windows NPM installation from /mnt/c/.
This configuration is not supported for updates.

To fix this issue:
  1. Install Node.js within your Linux distribution: e.g. sudo apt install nodejs npm
  2. Make sure Linux NPM is in your PATH before the Windows version
  3. Try updating again with 'clew update'
`);
      return 'install_failed';
    }

    const { hasPermissions } = await checkGlobalInstallPermissions();
    if (!hasPermissions) {
      return 'no_permissions';
    }

    // Use specific version if provided, otherwise use latest
    const packageSpec = specificVersion ? `${MACRO.PACKAGE_URL}@${specificVersion}` : MACRO.PACKAGE_URL;

    // Run from home directory to avoid reading project-level .npmrc/.bunfig.toml
    // which could be maliciously crafted to redirect to an attacker's registry
    const installResult = await execFileNoThrowWithCwd('npm', ['install', '-g', packageSpec], {
      cwd: homedir(),
    });
    if (installResult.code !== 0) {
      const error = new AutoUpdaterError(
        `Failed to install new version: ${installResult.stdout} ${installResult.stderr}`,
      );
      logError(error);
      return 'install_failed';
    }

    // Set installMethod to 'global' to track npm global installations
    saveGlobalConfig(current => ({
      ...current,
      installMethod: 'global',
    }));

    return 'success';
  } finally {
    // Ensure we always release the lock
    await releaseLock();
  }
}

/**
 * Remove claude aliases from shell configuration files
 * This helps clean up old installation methods when switching to native or npm global
 */
async function removeClaudeAliasesFromShellConfigs(): Promise<void> {
  const configMap = getShellConfigPaths();

  // Process each shell config file
  for (const [, configFile] of Object.entries(configMap)) {
    try {
      const lines = await readFileLines(configFile);
      if (!lines) continue;

      const { filtered, hadAlias } = filterClaudeAliases(lines);

      if (hadAlias) {
        await writeFileLines(configFile, filtered);
        logForDebugging(`Removed claude alias from ${configFile}`);
      }
    } catch (error) {
      // Don't fail the whole operation if one file can't be processed
      logForDebugging(`Failed to remove alias from ${configFile}: ${error}`, {
        level: 'error',
      });
    }
  }
}
