import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { ResearchClaim } from './types.js';

export async function savePendingMemory(
  cwd: string,
  topic: string,
  runId: string,
  claims: ResearchClaim[],
): Promise<string> {
  const fsImpl = getFsImplementation();
  const pendingDir = join(cwd, '.ceph', 'memory', 'pending');

  if (!fsImpl.existsSync(pendingDir)) {
    await mkdir(pendingDir, { recursive: true });
  }

  const date = new Date().toISOString().slice(0, 10);
  const sanitizedTopic = topic
    .replace(/[\\/:*?"<>|]/g, '_')
    .toLowerCase()
    .slice(0, 50);
  const pendingFilePath = join(pendingDir, `research-${sanitizedTopic}-${date}.md`);

  const frontmatter = [
    '---',
    'type: research_finding',
    `source: research:${runId}`,
    'status: pending_review',
    `created_at: ${new Date().toISOString()}`,
    'confidence: high',
    '---',
    '',
  ].join('\n');

  const proposedFindings = claims
    .map(claim => `- **Finding:** ${claim.claim} (Confidence: ${claim.confidence})`)
    .join('\n');

  const content = [
    frontmatter,
    `# Pending Research Memory — ${topic}`,
    '',
    '## Proposed Durable Findings',
    '',
    proposedFindings || '- No specific findings extracted for memory.',
    '',
    '## Evidence',
    '',
    `- \`.ceph/research/runs/${runId}/report.md\``,
  ].join('\n');

  await writeFile(pendingFilePath, content, 'utf-8');
  return pendingFilePath;
}
