import { getPlatform } from '../platform.js';
import { getInitialSettings } from '../settings/settings.js';
import { isGitBashAvailable } from '../windowsPaths.js';

/**
 * Resolve the default shell for input-box `!` commands.
 *
 * Resolution order (docs/design/ps-shell-selection.md §4.2):
 *   settings.defaultShell → (Windows without Git Bash → 'powershell') → 'bash'
 *
 * An explicit settings.defaultShell always wins so we never override users who
 * deliberately rely on bash. We only auto-flip to PowerShell on Windows when no
 * Git Bash (or WSL bash) is installed — otherwise bash commands would fail with
 * no working shell at all.
 */
export function resolveDefaultShell(): 'bash' | 'powershell' {
  const configured = getInitialSettings().defaultShell;
  if (configured) return configured;

  if (getPlatform() === 'windows' && !isGitBashAvailable()) {
    return 'powershell';
  }

  return 'bash';
}
