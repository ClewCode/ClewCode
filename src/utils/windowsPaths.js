import memoize from 'lodash-es/memoize.js';
import * as path from 'path';
import * as pathWin32 from 'path/win32';
import { getCwd } from './cwd.js';
import { logForDebugging } from './debug.js';
import { execSync_DEPRECATED } from './execSyncWrapper.js';
import { memoizeWithLRU } from './memoize.js';
import { getPlatform } from './platform.js';

/**
 * Check if a file or directory exists on Windows using the dir command
 * @param path - The path to check
 * @returns true if the path exists, false otherwise
 */
function checkPathExists(path) {
  try {
    execSync_DEPRECATED(`dir "${path}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
/**
 * Find an executable using where.exe on Windows
 * @param executable - The name of the executable to find
 * @returns The path to the executable or null if not found
 */
function findExecutable(executable) {
  // For git, check common installation locations first
  if (executable === 'git') {
    const defaultLocations = [
      // check 64 bit before 32 bit
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      // intentionally don't look for C:\Program Files\Git\mingw64\bin\git.exe
      // because that directory is the "raw" tools with no environment setup
    ];
    for (const location of defaultLocations) {
      if (checkPathExists(location)) {
        return location;
      }
    }
  }
  // Fall back to where.exe
  try {
    const result = execSync_DEPRECATED(`where.exe ${executable}`, {
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
    // SECURITY: Filter out any results from the current directory
    // to prevent executing malicious git.bat/cmd/exe files
    const paths = result.split('\r\n').filter(Boolean);
    const cwd = getCwd().toLowerCase();
    for (const candidatePath of paths) {
      // Normalize and compare paths to ensure we're not in current directory
      const normalizedPath = path.resolve(candidatePath).toLowerCase();
      const pathDir = path.dirname(normalizedPath).toLowerCase();
      // Skip if the executable is in the current working directory
      if (pathDir === cwd || normalizedPath.startsWith(cwd + path.sep)) {
        logForDebugging(`Skipping potentially malicious executable in current directory: ${candidatePath}`);
        continue;
      }
      // Return the first valid path that's not in the current directory
      return candidatePath;
    }
    return null;
  } catch {
    return null;
  }
}
/**
 * If Windows, set the SHELL environment variable to git-bash path.
 * This is used by BashTool and Shell.ts for user shell commands.
 * COMSPEC is left unchanged for system process execution.
 */
export function setShellIfWindows() {
  if (getPlatform() === 'windows') {
    const gitBashPath = findGitBashPath();
    process.env.SHELL = gitBashPath;
    logForDebugging(`Using bash path: "${gitBashPath}"`);
  }
}
/**
 * Find the path to bash.exe from Git for Windows installation.
 * Searches common installation locations.
 */
function findGitBashFromCommonLocations() {
  const commonPaths = [
    // Standard Git for Windows paths
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    // Portable Git
    'C:\\PortableGit\\bin\\bash.exe',
    // GitHub Desktop bundled Git
    process.env.LOCALAPPDATA
      ? pathWin32.join(process.env.LOCALAPPDATA, 'GitHubDesktop', 'app-bin', 'bin', 'bash.exe')
      : null,
    // Scoop installed Git
    process.env.USERPROFILE
      ? pathWin32.join(process.env.USERPROFILE, 'scoop', 'apps', 'git', 'current', 'bin', 'bash.exe')
      : null,
    // Choco installed Git
    'C:\\ProgramData\\chocolatey\\lib\\git\\tools\\bin\\bash.exe',
  ].filter(Boolean);
  for (const location of commonPaths) {
    if (checkPathExists(location)) {
      return location;
    }
  }
  return null;
}
/**
 * Find the path where `bash.exe` included with git-bash exists, exiting the process if not found.
 *
 * Resolution order:
 * 1. CLAUDE_CODE_GIT_BASH_PATH env var
 * 2. Git installation directory (via where.exe or PATH)
 * 3. Common installation paths (Program Files, Scoop, Choco, etc.)
 * 4. WSL bash (if WSL is installed)
 * 5. Exit with helpful error message
 */
export const findGitBashPath = memoize(() => {
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    if (checkPathExists(process.env.CLAUDE_CODE_GIT_BASH_PATH)) {
      return process.env.CLAUDE_CODE_GIT_BASH_PATH;
    }
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error(
      `Clew Code was unable to find CLAUDE_CODE_GIT_BASH_PATH path "${process.env.CLAUDE_CODE_GIT_BASH_PATH}"`,
    );
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1);
  }
  // Try finding git and resolving bash from its location
  const gitPath = findExecutable('git');
  if (gitPath) {
    const bashPath = pathWin32.join(gitPath, '..', '..', 'bin', 'bash.exe');
    if (checkPathExists(bashPath)) {
      return bashPath;
    }
  }
  // Try common installation paths
  const commonPath = findGitBashFromCommonLocations();
  if (commonPath) {
    return commonPath;
  }
  // Try WSL bash as fallback
  try {
    const result = execSync_DEPRECATED('wsl which bash', { stdio: 'pipe', encoding: 'utf8', timeout: 5000 }).trim();
    if (result) {
      return `wsl ${result}`;
    }
  } catch {
    // WSL not available
  }
  // biome-ignore lint/suspicious/noConsole:: intentional console output
  console.error(
    'Clew Code on Windows requires git-bash (https://git-scm.com/downloads/win). If installed but not in PATH, set environment variable pointing to your bash.exe, similar to: CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe',
  );
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1);
});
/**
 * Check if the default Windows shell is cmd.exe (no Git Bash or WSL available).
 */
export function isCmdExeDefault() {
  if (getPlatform() !== 'windows') return false;
  try {
    // If Git Bash or WSL bash is available, cmd.exe is not the default
    if (findGitBashPath()) return false;
  } catch {
    // findGitBashPath exits on failure, but catch just in case
  }
  return true;
}
/** Convert a Windows path to a POSIX path using pure JS. */
export const windowsPathToPosixPath = memoizeWithLRU(
  windowsPath => {
    // Handle UNC paths: \\server\share -> //server/share
    if (windowsPath.startsWith('\\\\')) {
      return windowsPath.replace(/\\/g, '/');
    }
    // Handle drive letter paths: C:\Users\foo -> /c/Users/foo
    const match = windowsPath.match(/^([A-Za-z]):[/\\]/);
    if (match) {
      const driveLetter = match[1].toLowerCase();
      return `/${driveLetter}${windowsPath.slice(2).replace(/\\/g, '/')}`;
    }
    // Already POSIX or relative — just flip slashes
    return windowsPath.replace(/\\/g, '/');
  },
  p => p,
  500,
);
/** Convert a POSIX path to a Windows path using pure JS. */
export const posixPathToWindowsPath = memoizeWithLRU(
  posixPath => {
    // Handle UNC paths: //server/share -> \\server\share
    if (posixPath.startsWith('//')) {
      return posixPath.replace(/\//g, '\\');
    }
    // Handle /cygdrive/c/... format
    const cygdriveMatch = posixPath.match(/^\/cygdrive\/([A-Za-z])(\/|$)/);
    if (cygdriveMatch) {
      const driveLetter = cygdriveMatch[1].toUpperCase();
      const rest = posixPath.slice(`/cygdrive/${cygdriveMatch[1]}`.length);
      return `${driveLetter}:${(rest || '\\').replace(/\//g, '\\')}`;
    }
    // Handle /c/... format (MSYS2/Git Bash)
    const driveMatch = posixPath.match(/^\/([A-Za-z])(\/|$)/);
    if (driveMatch) {
      const driveLetter = driveMatch[1].toUpperCase();
      const rest = posixPath.slice(2);
      return `${driveLetter}:${(rest || '\\').replace(/\//g, '\\')}`;
    }
    // Already Windows or relative — just flip slashes
    return posixPath.replace(/\//g, '\\');
  },
  p => p,
  500,
);
