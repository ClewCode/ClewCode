/**
 * Destructive-command detection shared by BashTool and PowerShellTool.
 *
 * The warning is purely informational — it is rendered in the permission
 * dialog and does not affect permission logic or auto-approval.
 *
 * `git`, SQL clients, `kubectl` and `terraform` behave identically whichever
 * shell invokes them, so their patterns live here and both tools consume the
 * same list. Previously each tool carried its own copy and they drifted: the
 * PowerShell copy was missing eight patterns the Bash copy had, so
 * `terraform destroy` warned under Bash and silently didn't under PowerShell.
 * Shell-specific deletion syntax (`rm -rf` vs `Remove-Item -Recurse`) stays in
 * the per-tool modules.
 */

export type DestructivePattern = {
  pattern: RegExp;
  warning: string;
};

/**
 * Patterns for commands whose destructive behavior is independent of the
 * calling shell. Case-sensitive where the underlying tool is: `git branch -D`
 * force-deletes while `-d` refuses to delete unmerged work, so matching these
 * case-insensitively would warn on the safe form.
 */
export const SHELL_AGNOSTIC_DESTRUCTIVE_PATTERNS: readonly DestructivePattern[] = [
  // Git — data loss / hard to reverse
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    warning: 'Note: may discard uncommitted changes',
  },
  {
    pattern: /\bgit\s+push\b[^;&|\n]*[ \t](--force|--force-with-lease|-f)\b/,
    warning: 'Note: may overwrite remote history',
  },
  {
    pattern: /\bgit\s+clean\b(?![^;&|\n]*(?:-[a-zA-Z]*n|--dry-run))[^;&|\n]*-[a-zA-Z]*f/,
    warning: 'Note: may permanently delete untracked files',
  },
  {
    pattern: /\bgit\s+checkout\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'Note: may discard all working tree changes',
  },
  {
    pattern: /\bgit\s+restore\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: 'Note: may discard all working tree changes',
  },
  {
    pattern: /\bgit\s+stash[ \t]+(drop|clear)\b/,
    warning: 'Note: may permanently remove stashed changes',
  },
  {
    pattern: /\bgit\s+branch\s+(-D[ \t]|--delete\s+--force|--force\s+--delete)\b/,
    warning: 'Note: may force-delete a branch',
  },

  // Git — safety bypass
  {
    pattern: /\bgit\s+(commit|push|merge)\b[^;&|\n]*--no-verify\b/,
    warning: 'Note: may skip safety hooks',
  },
  {
    pattern: /\bgit\s+commit\b[^;&|\n]*--amend\b/,
    warning: 'Note: may rewrite the last commit',
  },

  // Database
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: 'Note: may drop or truncate database objects',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w+[ \t]*(;|"|'|\n|$)/i,
    warning: 'Note: may delete all rows from a database table',
  },

  // Infrastructure
  {
    pattern: /\bkubectl\s+delete\b/,
    warning: 'Note: may delete Kubernetes resources',
  },
  {
    pattern: /\bterraform\s+destroy\b/,
    warning: 'Note: may destroy Terraform infrastructure',
  },
];

/**
 * Build a warning lookup over an ordered pattern list. The first match wins,
 * so callers control precedence by composing the list themselves — a shell
 * whose own deletion syntax should outrank the shared patterns puts its
 * entries first.
 */
export function buildDestructiveCommandWarner(
  patterns: readonly DestructivePattern[],
): (command: string) => string | null {
  return command => {
    for (const { pattern, warning } of patterns) {
      if (pattern.test(command)) {
        return warning;
      }
    }
    return null;
  };
}
