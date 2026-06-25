import { constants as fsConstants } from 'fs';
import { access } from 'fs/promises';
import { homedir } from 'os';
import { posix, win32 } from 'path';

import { getDynamicConfig_BLOCKS_ON_INIT } from 'src/services/analytics/growthbook.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';

import { type ReleaseChannel, saveGlobalConfig } from './config.js';
import { logForDebugging } from './debug.js';
import { env } from './env.js';
import { execFileNoThrowWithCwd } from './execFileNoThrow.js';
import { logError } from './log.js';
import { getPlatform } from './platform.js';
import { gte, lt } from './semver.js';
import { getInitialSettings } from './settings/settings.js';
import { filterClaudeAliases, getShellConfigPaths, readFileLines, writeFileLines } from './shellConfig.js';
import { sleep } from './sleep.js';
import { jsonParse } from './slowOperations.js';

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

export type UpdateErrorCategory = 'network' | 'permissions' | 'registry' | 'lock_contention' | 'platform' | 'unknown';

export function classifyUpdateError(error: unknown): {
  category: UpdateErrorCategory;
  osCode: string | null;
  message: string;
} {
  const msg = String(error);
  const err = error as Record<string, unknown> | null | undefined;

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

export async function assertMinVersion(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    const versionConfig = await getDynamicConfig_BLOCKS_ON_INIT<{
      minVersion: string;
    }>('tengu_version_config', { minVersion: '0.0.0' });

    if (versionConfig.minVersion && lt(MACRO.VERSION, versionConfig.minVersion)) {
      console.error(`
It looks like your version of Clew Code (${MACRO.VERSION}) needs an update.
A newer version (${versionConfig.minVersion} or higher) is required to continue.

To update, please run:
    clew update

This will ensure you have access to the latest features and improvements.
`);
      process.exit(1);
    }
  } catch (error) {
    logError(error as Error);
  }
}

export async function getMaxVersion(): Promise<string | undefined> {
  const config = await getMaxVersionConfig();
  if (process.env.USER_TYPE === 'ant') {
    return config.ant || undefined;
  }
  return config.external || undefined;
}

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

export function shouldSkipVersion(targetVersion: string): boolean {
  const settings = getInitialSettings();
  const minimumVersion = settings?.minimumVersion;
  if (!minimumVersion) {
    return false;
  }
  const shouldSkip = !gte(targetVersion, minimumVersion);
  if (shouldSkip) {
    logForDebugging(`Skipping update to ${targetVersion} - below minimumVersion ${minimumVersion}`);
  }
  return shouldSkip;
}

export async function checkGlobalInstallPermissions(): Promise<{
  hasPermissions: boolean;
  npmPrefix: string | null;
}> {
  try {
    const prefixResult = await execFileNoThrowWithCwd('npm', ['-g', 'config', 'get', 'prefix'], {
      cwd: homedir(),
    });
    if (prefixResult.code !== 0) {
      logError(new Error('Failed to check npm permissions'));
      return { hasPermissions: false, npmPrefix: null };
    }
    const prefix = prefixResult.stdout.trim();
    if (!prefix) {
      return { hasPermissions: false, npmPrefix: null };
    }
    await access(prefix, fsConstants.W_OK);
    return { hasPermissions: true, npmPrefix: prefix };
  } catch {
    return { hasPermissions: false, npmPrefix: null };
  }
}

export async function getLatestVersion(channel: ReleaseChannel): Promise<string | null> {
  const npmTag = channel === 'stable' ? 'stable' : 'latest';
  const maxRetries = 2;
  const baseDelay = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

    if (category.category === 'permissions') {
      break;
    }

    if (attempt < maxRetries) {
      await sleep(baseDelay * (attempt + 1));
    }
  }

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
    } catch (error) {
      logForDebugging(`bun x npm view threw: ${error}`);
    }
  }

  logForDebugging('npm/bun view failed, trying HTTP registry API fallback');
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(MACRO.PACKAGE_URL)}/${encodeURIComponent(npmTag)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = (await response.json()) as { version?: string };
      if (data?.version) {
        return data.version;
      }
    }
  } catch (error) {
    logForDebugging(`HTTP registry API threw: ${error}`);
  }

  return null;
}

export type NpmDistTags = {
  latest: string | null;
  stable: string | null;
};

export async function getNpmDistTags(): Promise<NpmDistTags> {
  function parseDistTags(json: string): NpmDistTags {
    try {
      const parsed = jsonParse(json.trim()) as Record<string, unknown>;
      return {
        latest: typeof parsed.latest === 'string' ? parsed.latest : null,
        stable: typeof parsed.stable === 'string' ? parsed.stable : null,
      };
    } catch {
      return { latest: null, stable: null };
    }
  }

  const result = await execFileNoThrowWithCwd(
    'npm',
    ['view', MACRO.PACKAGE_URL, 'dist-tags', '--json', '--prefer-online'],
    { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
  );
  if (result.code === 0 && result.stdout) {
    return parseDistTags(result.stdout);
  }

  if (env.isRunningWithBun()) {
    try {
      const bunResult = await execFileNoThrowWithCwd(
        'bun',
        ['x', 'npm', 'view', MACRO.PACKAGE_URL, 'dist-tags', '--json', '--prefer-online'],
        { abortSignal: AbortSignal.timeout(5000), cwd: homedir() },
      );
      if (bunResult.code === 0 && bunResult.stdout) {
        return parseDistTags(bunResult.stdout);
      }
    } catch (error) {
      logForDebugging(`bun x npm dist-tags threw: ${error}`);
    }
  }

  logForDebugging('npm/bun dist-tags failed, trying HTTP registry API fallback');
  try {
    const url = `https://registry.npmjs.org/${encodeURIComponent(MACRO.PACKAGE_URL)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = (await response.json()) as { 'dist-tags'?: Record<string, string> };
      if (data?.['dist-tags']) {
        return {
          latest: data['dist-tags'].latest ?? null,
          stable: data['dist-tags'].stable ?? null,
        };
      }
    }
  } catch (error) {
    logForDebugging(`HTTP registry API dist-tags threw: ${error}`);
  }

  return { latest: null, stable: null };
}

export async function getLatestVersionFromGcs(channel: ReleaseChannel): Promise<string | null> {
  return getLatestVersion(channel);
}

export async function getGcsDistTags(): Promise<NpmDistTags> {
  return getNpmDistTags();
}

export async function getVersionHistory(limit: number): Promise<string[]> {
  if (process.env.USER_TYPE !== 'ant') {
    return [];
  }

  const packageUrl = MACRO.NATIVE_PACKAGE_URL ?? MACRO.PACKAGE_URL;

  const result = await execFileNoThrowWithCwd('npm', ['view', packageUrl, 'versions', '--json', '--prefer-online'], {
    abortSignal: AbortSignal.timeout(30000),
    cwd: homedir(),
  });

  if (result.code !== 0) {
    logForDebugging(`npm view versions failed with code ${result.code}`);
    return [];
  }

  try {
    const allVersions = jsonParse(result.stdout.trim()) as string[];
    const safeVersions = allVersions.filter(version => {
      const major = parseInt(version.split('.')[0], 10);
      return major >= 2;
    });
    return safeVersions.slice(-limit).reverse();
  } catch (error) {
    logForDebugging(`Failed to parse version history: ${error}`);
    return [];
  }
}

export async function installGlobalPackage(specificVersion?: string | null): Promise<InstallStatus> {
  const { hasPermissions } = await checkGlobalInstallPermissions();
  if (!hasPermissions) {
    return 'no_permissions';
  }

  const packageSpec = specificVersion ? `${MACRO.PACKAGE_URL}@${specificVersion}` : MACRO.PACKAGE_URL;

  const pm = detectGlobalPackageManager();
  const pmCmd = pm === 'bun' ? 'bun' : 'npm';
  const pmArgs = ['install', '-g', packageSpec];

  const installResult = await execFileNoThrowWithCwd(pmCmd, pmArgs, {
    cwd: homedir(),
  });
  if (installResult.code !== 0) {
    logError(new Error(`Failed to install new version: ${installResult.stdout} ${installResult.stderr}`));
    return 'install_failed';
  }

  saveGlobalConfig(current => ({
    ...current,
    installMethod: 'global',
  }));

  logEvent('tengu_auto_updater_success', {
    fromVersion: MACRO.VERSION as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    toVersion: (specificVersion ?? 'latest') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    durationMs: 0,
    wasMigrated: false,
    installationType: 'npm-global' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  return 'success';
}

function detectGlobalPackageManager(): 'npm' | 'bun' {
  let invokedPath = process.argv[1] || '';
  let execPath = process.execPath || process.argv[0] || '';
  let argv0 = process.argv[0] || '';

  if (getPlatform() === 'windows') {
    invokedPath = invokedPath.split(win32.sep).join(posix.sep);
    execPath = execPath.split(win32.sep).join(posix.sep);
    argv0 = argv0.split(win32.sep).join(posix.sep);
  }

  const pathsToCheck = [invokedPath, execPath, argv0];

  if (getPlatform() === 'windows') {
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      const normalizedUserPath = userProfile.split(win32.sep).join(posix.sep);
      if (pathsToCheck.some(p => p.startsWith(`${normalizedUserPath}/.bun/bin/`))) {
        return 'bun';
      }
      if (pathsToCheck.some(p => p.startsWith(`${normalizedUserPath}/node_modules/`))) {
        const appData = process.env.APPDATA;
        const normalizedAppData = appData ? appData.split(win32.sep).join(posix.sep) : '';
        const hasNpmPath = normalizedAppData && pathsToCheck.some(p => p.startsWith(`${normalizedAppData}/npm/`));
        if (!hasNpmPath) {
          return 'bun';
        }
      }
    }
    const appData = process.env.APPDATA;
    if (appData) {
      const normalizedAppData = appData.split(win32.sep).join(posix.sep);
      if (pathsToCheck.some(p => p.startsWith(`${normalizedAppData}/npm/`))) {
        return 'npm';
      }
    }
  } else {
    const home = homedir();
    if (home && pathsToCheck.some(p => p.startsWith(`${home}/.bun/`))) {
      return 'bun';
    }
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

  return env.isRunningWithBun() ? 'bun' : 'npm';
}
