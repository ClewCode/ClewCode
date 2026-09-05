import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { ResearchClaim, ResearchMode, ResearchPlan, ResearchRun, ResearchSource } from './types.js';

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

const metadataLocks = new Map<string, Promise<unknown>>();

function withMetadataLock<T>(runDir: string, fn: () => Promise<T>): Promise<T> {
  const previous = metadataLocks.get(runDir) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  metadataLocks.set(runDir, next);
  const release = (): void => {
    if (metadataLocks.get(runDir) === next) metadataLocks.delete(runDir);
  };
  void next.then(release, release);
  return next;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function mutateRunMetadata(runDir: string, mutate: (run: ResearchRun) => void): Promise<void> {
  return withMetadataLock(runDir, async () => {
    const runJsonPath = join(runDir, 'run.json');
    const content = await readFile(runJsonPath, 'utf-8');
    const run = JSON.parse(content) as ResearchRun;
    mutate(run);
    await writeJsonAtomic(runJsonPath, run);
  });
}

async function allocateRunDirectory(cwd: string, query: string): Promise<RunStore> {
  const runsDir = join(cwd, DOT_CLEW, 'research', 'runs');
  await mkdir(runsDir, { recursive: true });
  const baseRunId = generateRunId(query);
  let counter = 1;

  while (true) {
    const runId = counter === 1 ? baseRunId : `${baseRunId}-${String(counter).padStart(3, '0')}`;
    const runDir = join(runsDir, runId);
    try {
      await mkdir(runDir);
      return { runId, runDir };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        counter += 1;
        continue;
      }
      throw error;
    }
  }
}

export async function createRunStore(cwd: string, query: string, mode: ResearchMode): Promise<RunStore> {
  const { runId, runDir } = await allocateRunDirectory(cwd, query);

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
  await writeJsonAtomic(join(runDir, 'run.json'), runJson);

  return { runId, runDir };
}

export async function appendSourceToRun(runDir: string, source: ResearchSource): Promise<void> {
  const line = `${JSON.stringify(source)}\n`;
  await appendFile(join(runDir, 'sources.jsonl'), line, 'utf-8');

  // Serialize metadata updates so parallel collectors cannot lose increments.
  await mutateRunMetadata(runDir, run => {
    run.sourceCount += 1;
  });
}

export async function appendClaimToRun(runDir: string, claim: ResearchClaim): Promise<void> {
  const line = `${JSON.stringify(claim)}\n`;
  await appendFile(join(runDir, 'claims.jsonl'), line, 'utf-8');

  // Serialize metadata updates so parallel extractors cannot lose increments.
  await mutateRunMetadata(runDir, run => {
    run.claimCount += 1;
    if (claim.status === 'unsupported') {
      run.unsupportedClaimCount += 1;
    }
  });
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
  await mutateRunMetadata(runDir, run => {
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.savedToWiki = savedToWiki;
    run.savedToMemoryPending = savedToMemoryPending;
  });
}

export async function getLatestRun(cwd: string): Promise<{ run: ResearchRun; runDir: string } | null> {
  const fsImpl = getFsImplementation();
  const runsDir = join(cwd, DOT_CLEW, 'research', 'runs');
  if (!fsImpl.existsSync(runsDir)) {
    return null;
  }

  const entries = await readdir(runsDir);
  if (entries.length === 0) {
    return null;
  }

  let latest: { run: ResearchRun; runDir: string } | null = null;
  for (const runId of entries) {
    const runDir = join(runsDir, runId);
    const runJsonPath = join(runDir, 'run.json');
    if (!fsImpl.existsSync(runJsonPath)) continue;
    try {
      const content = await readFile(runJsonPath, 'utf-8');
      const run = JSON.parse(content) as ResearchRun;
      if (
        !latest ||
        run.createdAt > latest.run.createdAt ||
        (run.createdAt === latest.run.createdAt && run.id > latest.run.id)
      ) {
        latest = { run, runDir };
      }
    } catch {
      // Ignore corrupted/incomplete runs and continue looking for the newest valid one.
    }
  }
  return latest;
}

export async function listAllRuns(cwd: string): Promise<ResearchRun[]> {
  const fsImpl = getFsImplementation();
  const runsDir = join(cwd, DOT_CLEW, 'research', 'runs');
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
      } catch (_err) {
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
