import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { redactSecrets } from '../redact.js';

export interface RunEvent {
  timestamp: string;
  type: string;
  message: string;
  metadata?: Record<string, any>;
}

export async function writeRunSummary(
  cwd: string,
  runId: string,
  task: string,
  filesTouched: string[],
  decisions: string[],
  events: RunEvent[],
): Promise<string> {
  const fsImpl = getFsImplementation();
  const dateStr = new Date().toISOString().slice(0, 10);
  const runDir = join(cwd, '.ceph', 'runs', dateStr);

  if (!fsImpl.existsSync(runDir)) {
    await mkdir(runDir, { recursive: true });
  }

  const summaryPath = join(runDir, `run-${runId}.summary.md`);
  const eventsPath = join(runDir, `run-${runId}.events.jsonl`);

  const redactedTask = redactSecrets(task);
  const redactedDecisions = decisions.map(d => redactSecrets(d));
  const redactedEvents = events.map(e => ({
    ...e,
    message: redactSecrets(e.message),
    metadata: e.metadata ? JSON.parse(redactSecrets(JSON.stringify(e.metadata))) : undefined,
  }));

  // Write events JSONL
  const jsonlContent = redactedEvents.map(e => JSON.stringify(e)).join('\n');
  await writeFile(eventsPath, jsonlContent, 'utf-8');

  // Write Markdown summary
  const markdown = [
    '---',
    `id: ceph:run:${dateStr}:${runId}`,
    'type: run_summary',
    `created: ${new Date().toISOString()}`,
    'status: completed',
    '---',
    '',
    `# Run ${runId} Summary`,
    '',
    '## Task',
    '',
    redactedTask,
    '',
    '## Files Touched',
    '',
    filesTouched.map(f => `- \`${f}\``).join('\n') || '- None',
    '',
    '## Decisions Made',
    '',
    redactedDecisions.map(d => `- ${d}`).join('\n') || '- No major decisions recorded.',
    '',
    '## Executed Steps',
    '',
    redactedEvents.map(e => `- [${e.timestamp}] **${e.type}**: ${e.message}`).join('\n') || '- No events recorded.',
  ].join('\n');

  await writeFile(summaryPath, markdown, 'utf-8');

  return summaryPath;
}
