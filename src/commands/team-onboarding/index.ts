import { writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { getOriginalCwd } from '../../bootstrap/state.js';
import type { Command } from '../../commands.js';
import { queryWithModel } from '../../services/api/claude.js';
import { getCwd } from '../../utils/cwd.js';
import { toError } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import { getBestModel } from '../../utils/model/model.js';
import { getProjectDir, getSessionFilesWithMtime, loadAllLogsFromSessionFile } from '../../utils/sessionStorage.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';

async function generateTeamOnboardingGuide(signal: AbortSignal): Promise<string> {
  const projectDir = getProjectDir(getOriginalCwd());
  const sessionFilesMap = await getSessionFilesWithMtime(projectDir);
  // Take last 10 sessions for context
  const recentSessions = Array.from(sessionFilesMap.values())
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10);

  const sessionData = [];
  for (const session of recentSessions) {
    try {
      const logs = await loadAllLogsFromSessionFile(session.path);
      if (logs.length > 0) {
        sessionData.push({
          sessionId: basename(session.path, '.jsonl'),
          project: logs[0].projectPath,
          summary: logs[0].summary,
          messages: logs[0].messages.slice(0, 5).map(m => ({
            role: m.type,
            content: typeof m.message.content === 'string' ? m.message.content : 'Complex content',
          })),
        });
      }
    } catch (err) {
      logError(toError(err));
    }
  }

  const userPrompt = `Analyze these recent Clew Code sessions and generate a "Teammate Ramp-up Guide".
This guide should help a new developer understand how Claude is being used in this project, common tasks performed, technical decisions made, and preferred tools/patterns.

SESSIONS:
${JSON.stringify(sessionData, null, 2)}

Output the guide in Markdown format.`;

  const model = getBestModel();
  const response = await queryWithModel({
    model,
    userPrompt,
    systemPrompt: asSystemPrompt(['You are an expert technical lead generating onboarding documentation.']),
    signal,
    options: {
      model,
      isNonInteractiveSession: false,
      querySource: 'team-onboarding' as any,
      agents: [],
      mcpTools: [],
      hasAppendSystemPrompt: false,
    },
  } as any);

  const guideContent = response.message.content[0].type === 'text' ? response.message.content[0].text : '';
  const outputPath = join(getCwd(), 'TEAM_ONBOARDING.md');
  await writeFile(outputPath, guideContent);
  return outputPath;
}

const teamOnboarding: Command = {
  type: 'prompt',
  name: 'team-onboarding',
  description: 'Generate a teammate ramp-up guide from your local Clew Code usage',
  contentLength: 0,
  progressMessage: 'analyzing usage and generating guide',
  source: 'builtin',
  async getPromptForCommand(_args, context) {
    const path = await generateTeamOnboardingGuide(context.abortController.signal);
    return [{ type: 'text', text: `Generated team onboarding guide at ${path}` }];
  },
};

export default teamOnboarding;
