/**
 * Tests for teamHelpers.ts — team file management utilities.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'crypto';
import { getTeammateStatuses } from '../teamDiscovery.js';
import {
  addHiddenPaneId,
  removeHiddenPaneId,
  sanitizeAgentName,
  sanitizeName,
  writeTeamFileAsync,
} from './teamHelpers.js';

describe('teamHelpers', () => {
  describe('sanitizeName', () => {
    test('lowercases input', () => {
      expect(sanitizeName('MyTeam')).toBe('myteam');
    });

    test('replaces non-alphanumeric with hyphens', () => {
      expect(sanitizeName('My Team!')).toBe('my-team-');
    });

    test('handles complex names', () => {
      expect(sanitizeName('Auth & Security Team')).toBe('auth---security-team');
    });
  });

  describe('sanitizeAgentName', () => {
    test('replaces @ with -', () => {
      expect(sanitizeAgentName('researcher@auth-team')).toBe('researcher-auth-team');
    });

    test('handles names without @', () => {
      expect(sanitizeAgentName('researcher')).toBe('researcher');
    });
  });

  // Regression: TeamsDialog h/H hide-show relies on hiddenPaneIds tracking to
  // reflect pane visibility after backend.hidePane/showPane calls.
  describe('hidden panes', () => {
    test('add/removeHiddenPaneId round-trips and surfaces via getTeammateStatuses', async () => {
      const configDir = await mkdtemp(join(tmpdir(), 'clew-teams-'));
      const prevConfigDir = process.env.CLEW_CONFIG_DIR;
      process.env.CLEW_CONFIG_DIR = configDir;
      try {
        const teamName = `hide-test-${randomUUID()}`;
        await writeTeamFileAsync(teamName, {
          name: teamName,
          createdAt: Date.now(),
          leadAgentId: 'lead',
          members: [
            {
              agentId: 'a1',
              name: 'worker',
              joinedAt: Date.now(),
              tmuxPaneId: '%42',
              cwd: configDir,
              subscriptions: [],
              backendType: 'tmux',
            },
          ],
        });

        expect(addHiddenPaneId(teamName, '%42')).toBe(true);
        expect(getTeammateStatuses(teamName)[0]?.isHidden).toBe(true);
        // Adding twice stays idempotent (no duplicate entries).
        expect(addHiddenPaneId(teamName, '%42')).toBe(true);

        expect(removeHiddenPaneId(teamName, '%42')).toBe(true);
        expect(getTeammateStatuses(teamName)[0]?.isHidden).toBe(false);
      } finally {
        if (prevConfigDir === undefined) {
          delete process.env.CLEW_CONFIG_DIR;
        } else {
          process.env.CLEW_CONFIG_DIR = prevConfigDir;
        }
        await rm(configDir, { recursive: true, force: true });
      }
    });
  });
});
