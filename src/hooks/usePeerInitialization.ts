/**
 * Swarm Initialization Hook
 *
 * Initializes swarm features: teammate hooks and context.
 * Handles both fresh spawns and resumed teammate sessions.
 *
 * This hook is conditionally loaded to allow dead code elimination when swarms are disabled.
 */

import { readdirSync } from 'fs';
import { useEffect } from 'react';
import { getSessionId } from '../bootstrap/state.js';
import type { AppState } from '../state/AppState.js';
import type { Message } from '../types/message.js';
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js';
import { logForDebugging } from '../utils/debug.js';
import { getTeamsDir } from '../utils/envUtils.js';
import { initializeTeammateContextFromSession } from '../utils/swarm/reconnection.js';
import { readTeamFile } from '../utils/swarm/teamHelpers.js';
import { initializeTeammateHooks } from '../utils/swarm/teammateInit.js';
import { getDynamicTeamContext } from '../utils/teammate.js';

type SetAppState = (f: (prevState: AppState) => AppState) => void;

/**
 * Hook that initializes swarm features when ENABLE_AGENT_SWARMS is true.
 *
 * Handles both:
 * - Resumed teammate sessions (from --resume or /resume) where teamName/agentName
 *   are stored in transcript messages
 * - Fresh spawns where context is read from environment variables
 */
export function usePeerInitialization(
  setAppState: SetAppState,
  initialMessages: Message[] | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    if (!isAgentSwarmsEnabled()) return;

    // Check if this is a resumed agent session (from --resume or /resume)
    // Resumed sessions have teamName/agentName stored in transcript messages
    const firstMessage = initialMessages?.[0];
    const teamName =
      firstMessage && 'teamName' in firstMessage ? (firstMessage.teamName as string | undefined) : undefined;
    const agentName =
      firstMessage && 'agentName' in firstMessage ? (firstMessage.agentName as string | undefined) : undefined;

    if (teamName && agentName) {
      // Resumed agent session - set up team context from stored info
      initializeTeammateContextFromSession(setAppState, teamName, agentName);

      // Get agentId from team file for hook initialization
      const teamFile = readTeamFile(teamName);
      const member = teamFile?.members.find((m: { name: string }) => m.name === agentName);
      if (member) {
        initializeTeammateHooks(setAppState, getSessionId(), {
          teamName,
          agentId: member.agentId,
          agentName,
        });
      }
      return;
    }

    // Fresh spawn or standalone session
    // teamContext is already computed in main.tsx via computeInitialTeamContext()
    // and included in initialState, so we only need to initialize hooks here
    const context = getDynamicTeamContext?.();
    if (context?.teamName && context?.agentId && context?.agentName) {
      initializeTeammateHooks(setAppState, getSessionId(), {
        teamName: context.teamName,
        agentId: context.agentId,
        agentName: context.agentName,
      });
      return;
    }

    // Leader crash recovery: check for orphaned teams from a prior session start.
    // If the current session was a team leader before a crash/restart, the
    // team directory still exists with leadSessionId matching our session ID.
    // Only runs when no team context or teammate identity is already set.
    try {
      const sessionId = getSessionId();
      const teamsDir = getTeamsDir();
      let entries: string[] = [];
      try {
        entries = readdirSync(teamsDir);
      } catch {
        // Teams dir doesn't exist yet — nothing to recover
        return;
      }

      for (const entry of entries) {
        const teamFile = readTeamFile(entry);
        if (!teamFile) continue;

        // Match: team was created by this session
        if (teamFile.leadSessionId !== sessionId) continue;

        logForDebugging(
          `[SwarmInit] Leader recovery: found orphaned team "${teamFile.name}" (${teamFile.members.length} members), restoring context`,
        );

        // Re-activate coordinator mode
        if (!process.env.CLAUDE_CODE_COORDINATOR_MODE) {
          process.env.CLAUDE_CODE_COORDINATOR_MODE = '1';
        }

        // Re-populate teamContext in AppState
        setAppState(prev => ({
          ...prev,
          teamContext: {
            teamName: teamFile.name,
            teamFilePath: '', // Will be rebuilt by helpers when needed
            leadAgentId: teamFile.leadAgentId,
            teammates: Object.fromEntries(
              teamFile.members.map(m => [
                m.agentId,
                {
                  name: m.name,
                  agentType: m.agentType,
                  color: m.color,
                  tmuxSessionName: '',
                  tmuxPaneId: m.tmuxPaneId,
                  cwd: m.cwd,
                  spawnedAt: m.joinedAt,
                },
              ]),
            ),
          },
        }));
        break; // Only one team per leader session
      }
    } catch (err) {
      logForDebugging(`[SwarmInit] Leader recovery scan failed: ${err}`);
    }
  }, [setAppState, initialMessages, enabled]);
}
