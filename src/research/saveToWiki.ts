import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';

export async function saveReportToWiki(
  cwd: string,
  topic: string,
  reportMarkdown: string,
  runId: string,
): Promise<string> {
  const fsImpl = getFsImplementation();
  const wikiDir = join(cwd, DOT_CLEW, 'wiki', 'Research');

  if (!fsImpl.existsSync(wikiDir)) {
    await mkdir(wikiDir, { recursive: true });
  }

  const sanitizedTopic = topic.replace(/[\\/:*?"<>|]/g, '_');
  const wikiFilePath = join(wikiDir, `${sanitizedTopic}.md`);

  const autoBlockStart = '<!-- clew:auto:start -->';
  const autoBlockEnd = '<!-- clew:auto:end -->';
  const userBlockStart = '<!-- clew:user:start -->';
  const userBlockEnd = '<!-- clew:user:end -->';

  const legacyUserBlockStart = '<!-- claude:user:start -->';
  const legacyUserBlockEnd = '<!-- claude:user:end -->';

  let userNotes =
    '## User Notes\n\n*(Add your custom notes here. This block is preserved during future research updates.)*';

  // Read existing file if it exists to extract the user block
  if (fsImpl.existsSync(wikiFilePath)) {
    try {
      const existingContent = await readFile(wikiFilePath, 'utf-8');
      let userStartIdx = existingContent.indexOf(userBlockStart);
      let userEndIdx = existingContent.indexOf(userBlockEnd);
      let tagLength = userBlockStart.length;

      if (userStartIdx === -1) {
        userStartIdx = existingContent.indexOf(legacyUserBlockStart);
        userEndIdx = existingContent.indexOf(legacyUserBlockEnd);
        tagLength = legacyUserBlockStart.length;
      }

      if (userStartIdx !== -1 && userEndIdx !== -1 && userEndIdx > userStartIdx) {
        userNotes = existingContent.slice(userStartIdx + tagLength, userEndIdx).trim();
      }
    } catch (_err) {
      // Keep default user notes if reading fails
    }
  }

  const generatedAutoContent = [
    `# Research: ${topic}`,
    '',
    `*Generated from research run: [${runId}](../research/runs/${runId}/report.md)*`,
    '',
    reportMarkdown,
  ].join('\n');

  const finalContent = [
    autoBlockStart,
    generatedAutoContent,
    autoBlockEnd,
    '',
    userBlockStart,
    userNotes,
    userBlockEnd,
  ].join('\n');

  await writeFile(wikiFilePath, finalContent, 'utf-8');
  return wikiFilePath;
}
