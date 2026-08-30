/**
 * Detects potentially destructive bash commands and returns a warning string
 * for display in the permission dialog. This is purely informational — it
 * doesn't affect permission logic or auto-approval.
 *
 * Shell-agnostic commands (git, SQL, kubectl, terraform) come from
 * `tools/shared/destructiveCommandPatterns.ts` so BashTool and PowerShellTool
 * cannot drift apart on them again.
 */

import {
  buildDestructiveCommandWarner,
  type DestructivePattern,
  SHELL_AGNOSTIC_DESTRUCTIVE_PATTERNS,
} from '../shared/destructiveCommandPatterns.js';

/**
 * POSIX deletion syntax. Dangerous *paths* are handled separately by
 * checkDangerousRemovalPaths — these only describe the flags.
 */
const BASH_DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = [
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR][a-zA-Z]*f|(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]/,
    warning: 'Note: may recursively force-remove files',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR]/,
    warning: 'Note: may recursively remove files',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f/,
    warning: 'Note: may force-remove files',
  },
];

// Shared patterns are tested first, preserving the precedence this module has
// always had (a `git clean -f && rm -rf x` reports the git warning).
const matchDestructiveCommand = buildDestructiveCommandWarner([
  ...SHELL_AGNOSTIC_DESTRUCTIVE_PATTERNS,
  ...BASH_DESTRUCTIVE_PATTERNS,
]);

/**
 * Checks if a bash command matches known destructive patterns.
 * Returns a human-readable warning string, or null if no destructive pattern is detected.
 */
export function getDestructiveCommandWarning(command: string): string | null {
  return matchDestructiveCommand(command);
}
