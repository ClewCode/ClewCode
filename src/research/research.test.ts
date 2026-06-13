import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { buildCitations, formatBibliography } from './citations.js';
import { createClaim, extractClaimsFromText } from './claims.js';
import { createResearchPlan } from './planner.js';
import { buildResearchReport } from './reportBuilder.js';
import {
  appendClaimToRun,
  appendSourceToRun,
  completeRunStore,
  createRunStore,
  getLatestRun,
  readClaimsFromRun,
  readSourcesFromRun,
  writePlanToRun,
  writeReportToRun,
} from './runStore.js';
import { savePendingMemory } from './savePendingMemory.js';
import { saveReportToWiki } from './saveToWiki.js';
import { readSourceDocument } from './sourceReader.js';
import type { ResearchClaim, ResearchSource } from './types.js';
import { getResearchWorkspaceStatus, initWorkspace } from './workspace.js';

const tempCwd = join(process.cwd(), 'temp-test-research-workspace');

describe('Research Agent Pipeline', () => {
  beforeAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(tempCwd)) {
      await rm(tempCwd, { recursive: true, force: true });
    }
    await mkdir(tempCwd, { recursive: true });
  });

  afterAll(async () => {
    const fsImpl = getFsImplementation();
    if (fsImpl.existsSync(tempCwd)) {
      await rm(tempCwd, { recursive: true, force: true });
    }
  });

  test('Workspace initialization & diagnostics', async () => {
    const statusBefore = await getResearchWorkspaceStatus(tempCwd);
    expect(statusBefore.initialized).toBe(false);

    await initWorkspace(tempCwd);

    const statusAfter = await getResearchWorkspaceStatus(tempCwd);
    expect(statusAfter.initialized).toBe(true);
    expect(statusAfter.researchDir).toContain(DOT_CLEW);
  });

  test('Research Planner generates valid plans', () => {
    const query = 'Analyze database indexing patterns';
    const planDeep = createResearchPlan(query, 'deep');

    expect(planDeep.question).toBe(query);
    expect(planDeep.mode).toBe('deep');
    expect(planDeep.subQuestions.length).toBeGreaterThan(0);
    expect(planDeep.doneCriteria.length).toBeGreaterThan(0);
    expect(planDeep.risks.length).toBeGreaterThan(0);

    const planQuick = createResearchPlan(query, 'quick');
    expect(planQuick.mode).toBe('quick');
    expect(planQuick.subQuestions.length).toBe(2);
  });

  test('Run Store serialization & deserialization', async () => {
    const query = 'Test Run Serialization';
    const mode = 'quick';

    const { runId, runDir } = await createRunStore(tempCwd, query, mode);
    expect(runId).toBeDefined();
    expect(runDir).toContain(runId);

    const dummySource: ResearchSource = {
      id: 'source:test-src-1',
      type: 'local_repo',
      title: 'Dummy Source',
      path: 'src/dummy.ts',
      retrievedAt: new Date().toISOString(),
      trust: 'high',
      excerpt: 'This is a test document excerpt.',
    };

    await appendSourceToRun(runDir, dummySource);

    const dummyClaim: ResearchClaim = {
      id: 'claim:test-src-1:001',
      claim: 'Test claim content extracted from sources',
      type: 'fact',
      status: 'supported',
      confidence: 'high',
      sourceIds: ['source:test-src-1'],
    };

    await appendClaimToRun(runDir, dummyClaim);

    const plan = createResearchPlan(query, mode);
    await writePlanToRun(runDir, plan);
    await writeReportToRun(runDir, '# Mock Report');
    await completeRunStore(runDir);

    const latest = await getLatestRun(tempCwd);
    expect(latest).not.toBeNull();
    expect(latest!.run.id).toBe(runId);
    expect(latest!.run.status).toBe('completed');
    expect(latest!.run.sourceCount).toBe(1);
    expect(latest!.run.claimCount).toBe(1);

    const readSources = await readSourcesFromRun(runDir);
    expect(readSources.length).toBe(1);
    expect(readSources[0].id).toBe('source:test-src-1');

    const readClaims = await readClaimsFromRun(runDir);
    expect(readClaims.length).toBe(1);
    expect(readClaims[0].id).toBe('claim:test-src-1:001');
  });

  test('Source Reader reads file contents safely', async () => {
    const dummyFilePath = join(tempCwd, 'src', 'test-file.ts');
    await mkdir(join(tempCwd, 'src'), { recursive: true });
    await writeFile(dummyFilePath, 'console.log("hello world");', 'utf-8');

    const source: ResearchSource = {
      id: 'source:test-file',
      type: 'local_repo',
      title: 'Test File',
      path: 'src/test-file.ts',
      retrievedAt: new Date().toISOString(),
      trust: 'high',
    };

    const content = await readSourceDocument(tempCwd, source);
    expect(content).toContain('console.log("hello world");');
    expect(content).toContain('Source Code: src/test-file.ts');
  });

  test('Claims extraction and citation building', () => {
    const dummyText = [
      '- First fact that is long enough to be extracted.',
      '- Second important fact that we want to cite.',
      '* Third bullet claim that has some substance.',
      '- Short',
    ].join('\n');

    const claims = extractClaimsFromText(dummyText, 'source:test-src');
    expect(claims.length).toBe(3);
    expect(claims[0].claim).toBe('First fact that is long enough to be extracted.');
    expect(claims[0].sourceIds).toContain('source:test-src');

    const sources: ResearchSource[] = [
      {
        id: 'source:test-src',
        type: 'local_repo',
        title: 'Test Source File',
        path: 'src/test.ts',
        retrievedAt: new Date().toISOString(),
        trust: 'high',
      },
    ];

    const citations = buildCitations(sources, claims);
    expect(citations.length).toBe(1);
    expect(citations[0].sourceId).toBe('source:test-src');
    expect(citations[0].usedForClaims.length).toBe(3);

    const bibliography = formatBibliography(citations);
    expect(bibliography).toContain('cite:001');
    expect(bibliography).toContain('Test Source File');
  });

  test('Report Builder structures report correctly', () => {
    const query = 'GrowthBook Setup';
    const plan = createResearchPlan(query, 'quick');
    const claims = [
      createClaim('claim:src:001', 'GrowthBook is integrated locally.', 'fact', 'supported', 'high', ['source:src']),
    ];
    const citations = buildCitations(
      [
        {
          id: 'source:src',
          type: 'local_repo',
          title: 'src/config.ts',
          path: 'src/config.ts',
          retrievedAt: new Date().toISOString(),
          trust: 'high',
        },
      ],
      claims,
    );

    const report = buildResearchReport(query, plan, claims, citations);
    expect(report).toContain('# Research Report — GrowthBook Setup');
    expect(report).toContain('Question');
    expect(report).toContain('Key Findings');
    expect(report).toContain('GrowthBook is integrated locally.');
    expect(report).toContain('Risks');
    expect(report).toContain('Sources');
  });

  test('Wiki saving & block merge preservation', async () => {
    const reportMarkdown = '## Findings\n\nSome important facts';
    const runId = '2026-05-20-test-run';

    // First Save (creates file)
    const wikiPath = await saveReportToWiki(tempCwd, 'My Topic', reportMarkdown, runId);
    const fsImpl = getFsImplementation();
    expect(fsImpl.existsSync(wikiPath)).toBe(true);

    const firstContent = fsImpl.readFileSync(wikiPath, { encoding: 'utf-8' });
    expect(firstContent).toContain('<!-- claude:auto:start -->');
    expect(firstContent).toContain('Some important facts');
    expect(firstContent).toContain('<!-- claude:user:start -->');
    expect(firstContent).toContain(
      '*(Add your custom notes here. This block is preserved during future research updates.)*',
    );

    // Simulate User editing User Notes block
    const userModifiedContent = firstContent.replace(
      '*(Add your custom notes here. This block is preserved during future research updates.)*',
      'Custom user edited notes here!',
    );
    await writeFile(wikiPath, userModifiedContent, 'utf-8');

    // Second Save (should preserve custom notes)
    const newReportMarkdown = '## Findings\n\nUpdated new findings';
    await saveReportToWiki(tempCwd, 'My Topic', newReportMarkdown, runId);

    const secondContent = fsImpl.readFileSync(wikiPath, { encoding: 'utf-8' });
    expect(secondContent).toContain('Updated new findings');
    expect(secondContent).not.toContain('Some important facts');
    expect(secondContent).toContain('Custom user edited notes here!');
  });

  test('Saving proposed findings to Pending Memory', async () => {
    const claims = [
      createClaim('claim:src:001', 'High quality validation rule.', 'fact', 'supported', 'high', ['source:src']),
    ];

    const pendingPath = await savePendingMemory(tempCwd, 'My Memory Topic', '2026-05-20-run', claims);
    const fsImpl = getFsImplementation();
    expect(fsImpl.existsSync(pendingPath)).toBe(true);

    const content = fsImpl.readFileSync(pendingPath, { encoding: 'utf-8' });
    expect(content).toContain('type: research_finding');
    expect(content).toContain('status: pending_review');
    expect(content).toContain('Pending Research Memory');
    expect(content).toContain('High quality validation rule.');
  });
});
