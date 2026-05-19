import type { LogOption } from '../types/logs.js';
import { listSessions, pingDaemon } from '../services/Supervisor/ipcClient.js';
import { getLastSessionLog } from './sessionStorage.js';
import { validateUuid } from './uuid.js';

type SupervisorSession = {
  id: string;
  cwd: string;
  startedAt: number;
  updatedAt?: number;
  status: string;
  name?: string;
  prompt?: string;
};

function supervisorSessionToLogOption(session: SupervisorSession): LogOption {
  const started = new Date(session.startedAt);
  const modified = new Date(session.updatedAt ?? session.startedAt);
  const title = session.name ?? session.prompt ?? 'Background session';

  return {
    date: started.toISOString(),
    messages: [],
    value: session.startedAt,
    created: started,
    modified,
    firstPrompt: title,
    messageCount: 0,
    isSidechain: false,
    isLite: true,
    sessionId: session.id,
    isBackground: true,
    projectPath: session.cwd,
    customTitle: session.name,
  };
}

/**
 * Load background (--bg / agent view) sessions from the supervisor roster that
 * are not already present in the interactive session log list.
 */
export async function loadBackgroundSessionsForResume(existingSessionIds: Set<string>): Promise<LogOption[]> {
  const supervisorRunning = await pingDaemon();
  if (!supervisorRunning) {
    return [];
  }

  const result = await listSessions();
  if (!result.ok) {
    return [];
  }

  const data = result.data as { sessions?: SupervisorSession[] } | undefined;
  const sessions = data?.sessions ?? [];
  const backgroundLogs: LogOption[] = [];

  for (const session of sessions) {
    if (!session.id || existingSessionIds.has(session.id)) {
      continue;
    }

    const sessionUuid = validateUuid(session.id);
    if (sessionUuid) {
      const transcript = await getLastSessionLog(sessionUuid);
      if (transcript) {
        backgroundLogs.push({ ...transcript, isBackground: true });
        continue;
      }
    }

    backgroundLogs.push(supervisorSessionToLogOption(session));
  }

  return backgroundLogs;
}
