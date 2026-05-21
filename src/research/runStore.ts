import { appendFile, mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { ResearchClaim, ResearchPlan, ResearchRun, ResearchSource } from './types.js';

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

export function generateRunId(query: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(query).slice(0, 50);
  return `${date}-${slug || 'run'}`;
}

export type RunStore = {
  runId: string;
  runDir: string;
};

export async function createRunStore(cwd: string, query: string, mode: any): Promise<RunStore> {
  const runId = generateRunId(query);
  const runDir = join(cwd, '.ceph', 'research', 'runs', runId);

  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(runDir)) {
    await mkdir(runDir, { recursive: true });
  }

  // Write query.md
  const queryMdContent = [
    '# Research Query',
    '',
    '## Original Query',
    '',
    query,
    '',
    '## Mode',
    '',
    mode,
    '',
    '## Created At',
    '',
    new Date().toISOString(),
  ].join('\n');

  await writeFile(join(runDir, 'query.md'), queryMdContent, 'utf-8');

  // Initialize empty jsonl files if they don't exist
  await writeFile(join(runDir, 'sources.jsonl'), '', 'utf-8');
  await writeFile(join(runDir, 'claims.jsonl'), '', 'utf-8');

  // Initialize run.json
  const runJson: ResearchRun = {
    id: runId,
    query,
    mode,
    status: 'running',
    createdAt: new Date().toISOString(),
    sourceCount: 0,
    claimCount: 0,
    unsupportedClaimCount: 0,
    savedToWiki: false,
    savedToMemoryPending: false,
  };
  await writeFile(join(runDir, 'run.json'), JSON.stringify(runJson, null, 2), 'utf-8');

  return { runId, runDir };
}

export async function appendSourceToRun(runDir: string, source: ResearchSource): Promise<void> {
  const line = JSON.stringify(source) + '\n';
  await appendFile(join(runDir, 'sources.jsonl'), line, 'utf-8');

  // Increment sourceCount in run.json
  const runJsonPath = join(runDir, 'run.json');
  try {
    const content = await readFile(runJsonPath, 'utf-8');
    const run: ResearchRun = JSON.parse(content);
    run.sourceCount += 1;
    await writeFile(runJsonPath, JSON.stringify(run, null, 2), 'utf-8');
  } catch (err) {
    // Ignore issues if run.json cannot be read/updated
  }
}

export async function appendClaimToRun(runDir: string, claim: ResearchClaim): Promise<void> {
  const line = JSON.stringify(claim) + '\n';
  await appendFile(join(runDir, 'claims.jsonl'), line, 'utf-8');

  // Update claimCount in run.json
  const runJsonPath = join(runDir, 'run.json');
  try {
    const content = await readFile(runJsonPath, 'utf-8');
    const run: ResearchRun = JSON.parse(content);
    run.claimCount += 1;
    if (claim.status === 'unsupported') {
      run.unsupportedClaimCount += 1;
    }
    await writeFile(runJsonPath, JSON.stringify(run, null, 2), 'utf-8');
  } catch (err) {
    // Ignore issues
  }
}

export async function writePlanToRun(runDir: string, plan: ResearchPlan): Promise<void> {
  const planMdContent = [
    '# Research Plan',
    '',
    '## Question',
    '',
    plan.question,
    '',
    '## Sub-questions',
    '',
    plan.subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    '',
    '## Source Strategy',
    '',
    '| Source Type |',
    '|---|',
    plan.sourceStrategy.map(s => `| ${s} |`).join('\n'),
    '',
    '## Done Criteria',
    '',
    plan.doneCriteria.map(c => `- ${c}`).join('\n'),
    '',
    '## Risks',
    '',
    plan.risks.map(r => `- ${r}`).join('\n'),
  ].join('\n');

  await writeFile(join(runDir, 'plan.md'), planMdContent, 'utf-8');
}

export async function writeReportToRun(runDir: string, reportMarkdown: string): Promise<void> {
  await writeFile(join(runDir, 'report.md'), reportMarkdown, 'utf-8');
}

export async function completeRunStore(
  runDir: string,
  savedToWiki = false,
  savedToMemoryPending = false,
): Promise<void> {
  const runJsonPath = join(runDir, 'run.json');
  try {
    const content = await readFile(runJsonPath, 'utf-8');
    const run: ResearchRun = JSON.parse(content);
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.savedToWiki = savedToWiki;
    run.savedToMemoryPending = savedToMemoryPending;
    await writeFile(runJsonPath, JSON.stringify(run, null, 2), 'utf-8');
  } catch (err) {
    // Ignore issues
  }
}

export async function getLatestRun(cwd: string): Promise<{ run: ResearchRun; runDir: string } | null> {
  const fsImpl = getFsImplementation();
  const runsDir = join(cwd, '.ceph', 'research', 'runs');
  if (!fsImpl.existsSync(runsDir)) {
    return null;
  }

  const entries = await readdir(runsDir);
  if (entries.length === 0) {
    return null;
  }

  // Sort by entry directory name (since format is YYYY-MM-DD-query, alphabetical/date sorting is perfect)
  entries.sort();
  const latestRunId = entries[entries.length - 1]!;
  const runDir = join(runsDir, latestRunId);
  const runJsonPath = join(runDir, 'run.json');

  if (!fsImpl.existsSync(runJsonPath)) {
    return null;
  }

  try {
    const content = await readFile(runJsonPath, 'utf-8');
    const run: ResearchRun = JSON.parse(content);
    return { run, runDir };
  } catch (err) {
    return null;
  }
}

export async function listAllRuns(cwd: string): Promise<ResearchRun[]> {
  const fsImpl = getFsImplementation();
  const runsDir = join(cwd, '.ceph', 'research', 'runs');
  if (!fsImpl.existsSync(runsDir)) {
    return [];
  }

  const entries = await readdir(runsDir);
  const runs: ResearchRun[] = [];

  for (const entry of entries) {
    const runJsonPath = join(runsDir, entry, 'run.json');
    if (fsImpl.existsSync(runJsonPath)) {
      try {
        const content = await readFile(runJsonPath, 'utf-8');
        runs.push(JSON.parse(content));
      } catch (err) {
        // Ignore unparseable runs
      }
    }
  }

  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs;
}

export async function readSourcesFromRun(runDir: string): Promise<ResearchSource[]> {
  const sourcesPath = join(runDir, 'sources.jsonl');
  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(sourcesPath)) {
    return [];
  }

  const content = await readFile(sourcesPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

export async function readClaimsFromRun(runDir: string): Promise<ResearchClaim[]> {
  const claimsPath = join(runDir, 'claims.jsonl');
  const fsImpl = getFsImplementation();
  if (!fsImpl.existsSync(claimsPath)) {
    return [];
  }

  const content = await readFile(claimsPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}
