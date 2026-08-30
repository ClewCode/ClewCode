import { describe, expect, test } from 'bun:test';
import { getDestructiveCommandWarning as bashWarning } from '../BashTool/destructiveCommandWarning.js';
import { getDestructiveCommandWarning as powershellWarning } from '../PowerShellTool/destructiveCommandWarning.js';

/**
 * These two tools each keep their own shell-specific deletion patterns but
 * must agree on everything that behaves identically in either shell. They
 * previously kept separate copies and drifted: the PowerShell list was missing
 * eight patterns, so `terraform destroy` warned under Bash and silently did
 * not under PowerShell.
 */
const SHELL_AGNOSTIC_COMMANDS = [
  'git reset --hard',
  'git push --force',
  'git push --force-with-lease origin main',
  'git clean -fd',
  'git checkout .',
  'git restore .',
  'git stash drop',
  'git branch -D old-branch',
  'git commit --no-verify -m "wip"',
  'git commit --amend',
  'DROP TABLE users',
  'TRUNCATE TABLE sessions',
  'DELETE FROM users;',
  'kubectl delete pod api-0',
  'terraform destroy',
];

describe('destructive command warnings', () => {
  describe('shell-agnostic parity', () => {
    for (const command of SHELL_AGNOSTIC_COMMANDS) {
      test(`both shells warn identically for: ${command}`, () => {
        const fromBash = bashWarning(command);
        expect(fromBash).not.toBeNull();
        expect(powershellWarning(command)).toBe(fromBash);
      });
    }
  });

  describe('shell-specific patterns still apply', () => {
    test('bash recognizes rm -rf', () => {
      expect(bashWarning('rm -rf ./build')).toBe('Note: may recursively force-remove files');
    });

    test('powershell recognizes Remove-Item -Recurse -Force', () => {
      expect(powershellWarning('Remove-Item -Recurse -Force ./build')).toBe('Note: may recursively force-remove files');
    });

    test('powershell recognizes system operations bash has no equivalent for', () => {
      expect(powershellWarning('Stop-Computer')).toBe('Note: will shut down the computer');
      expect(powershellWarning('Clear-RecycleBin')).toBe('Note: permanently deletes recycled files');
    });
  });

  describe('no false positives', () => {
    test('safe commands produce no warning', () => {
      expect(bashWarning('ls -la')).toBeNull();
      expect(bashWarning('git status')).toBeNull();
      expect(powershellWarning('Get-ChildItem')).toBeNull();
      expect(powershellWarning('git status')).toBeNull();
    });

    test('git branch -d (safe delete) is not confused with -D', () => {
      // Case matters: -d refuses to delete unmerged work, -D forces it.
      expect(bashWarning('git branch -d merged-branch')).toBeNull();
      expect(powershellWarning('git branch -d merged-branch')).toBeNull();
    });

    test('git clean with --dry-run is not flagged', () => {
      expect(bashWarning('git clean -n')).toBeNull();
      expect(powershellWarning('git clean --dry-run')).toBeNull();
    });
  });
});
