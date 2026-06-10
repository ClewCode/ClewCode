import { join } from 'path';
import { buildCitations } from '../../research/citations.js';
import { extractClaimsFromText } from '../../research/claims.js';
import { collectLocalMemory } from '../../research/collectors/localMemory.js';
import { collectLocalRepo } from '../../research/collectors/localRepo.js';
import { collectLocalWiki } from '../../research/collectors/localWiki.js';
import { collectWebSearch } from '../../research/collectors/webSearch.js';
import {
  C,
  claimLine,
  researchHeader,
  sourceLine,
  stepDone,
  stepStart,
  summaryFooter,
  synthesisBox,
} from '../../research/outputUI.js';
import { createResearchPlan } from '../../research/planner.js';
import { buildResearchReport } from '../../research/reportBuilder.js';
import {
  appendClaimToRun,
  appendSourceToRun,
  completeRunStore,
  createRunStore,
  getLatestRun,
  listAllRuns,
  readClaimsFromRun,
  readSourcesFromRun,
  writePlanToRun,
  writeReportToRun,
} from '../../research/runStore.js';
import { savePendingMemory } from '../../research/savePendingMemory.js';
import { saveReportToWiki } from '../../research/saveToWiki.js';
import { readSourceDocument } from '../../research/sourceReader.js';
import { synthesizeClaims } from '../../research/synthesizer.js';
import type { ResearchMode } from '../../research/types.js';
import { getResearchWorkspaceStatus, initWorkspace } from '../../research/workspace.js';
import type { LocalCommandCall } from '../../types/command.js';
import { getFsImplementation } from '../../utils/fsOperations.js';

export const call: LocalCommandCall = async (args, _context) => {
  const cwd = process.cwd();
  const trimmed = args.trim();
  if (!trimmed) {
    return {
      type: 'text',
      value: [
        'Usage: /research <query> OR /research <subcommand> [args]',
        '',
        'Quick Search:',
        '  /research React 19 release notes',
        '',
        'Subcommands:',
        '  init                            Initialize research folders',
        '  plan <query> [--mode <mode>]    Generate and print a research plan',
        '  run <query> [--mode <mode>]     Execute a complete research run',
        '  sources                         List all collected sources from the latest run',
        '  open <source-id>                Open and view content of a collected source',
        '  claims                          List extracted claims from the latest run',
        '  report                          Print the report from the latest run',
        '  save [--to-wiki|--to-memory|--to both]  Save the latest report to wiki / memory',
        '  doctor                          Run system diagnostic status check',
      ].join('\n'),
    };
  }

  const argv = trimmed.split(/\s+/);
  const firstWord = argv[0].toLowerCase();
  const SUBCOMMANDS = new Set(['init', 'plan', 'run', 'sources', 'open', 'claims', 'report', 'save', 'doctor']);

  let subcommand = 'run';
  let queryAndFlags = trimmed;

  if (SUBCOMMANDS.has(firstWord)) {
    subcommand = firstWord;
    queryAndFlags = trimmed.slice(firstWord.length).trim();
  }

  // Parse query and mode
  let mode: ResearchMode = 'quick';
  let query = queryAndFlags;

  if (queryAndFlags.includes('--mode')) {
    const modeIdx = queryAndFlags.indexOf('--mode');
    const modePart = queryAndFlags
      .slice(modeIdx + 6)
      .trim()
      .split(/\s+/)[0];
    if (modePart) {
      mode = modePart as ResearchMode;
    }
    query = queryAndFlags.slice(0, modeIdx).trim();
  }

  switch (subcommand) {
    case 'init': {
      await initWorkspace(cwd);
      return { type: 'text', value: 'Research workspace initialized under `.claude/`' };
    }

    case 'plan': {
      if (!query) {
        return { type: 'text', value: 'Error: Please specify a research query. Example: `/research plan GrowthBook`.' };
      }

      await initWorkspace(cwd);
      const plan = createResearchPlan(query, mode);
      const { runDir } = await createRunStore(cwd, query, mode);
      await writePlanToRun(runDir, plan);

      return {
        type: 'text',
        value: [
          `Research Plan: "${query}" (Mode: ${mode})`,
          `Saved to: \`${runDir}\``,
          '',
          `**Sub-questions:**`,
          ...plan.subQuestions.map((q, i) => `  ${i + 1}. ${q}`),
          '',
          `**Sources:** ${plan.sourceStrategy.join(', ')}`,
          `**Done criteria:** ${plan.doneCriteria.join(', ')}`,
          `**Risks:** ${plan.risks.join(', ')}`,
        ].join('\n'),
      };
    }

    case 'run': {
      if (!query) {
        return { type: 'text', value: 'Error: Please specify a research query. Example: `/research run GrowthBook`.' };
      }

      await initWorkspace(cwd);

      // 0. Plan
      const plan = createResearchPlan(query, mode);
      const { runId, runDir } = await createRunStore(cwd, query, mode);
      await writePlanToRun(runDir, plan);

      const lines: string[] = [];
      lines.push(researchHeader(query, mode));

      // 1. Source Collection
      lines.push(stepStart('Collecting sources'));
      const repoSources = plan.sourceStrategy.includes('local_repo') ? await collectLocalRepo(cwd, query) : [];
      const wikiSources = plan.sourceStrategy.includes('local_wiki') ? await collectLocalWiki(cwd, query) : [];
      const memorySources = plan.sourceStrategy.includes('local_memory') ? await collectLocalMemory(cwd, query) : [];
      const webSources = plan.sourceStrategy.includes('web') ? await collectWebSearch(cwd, query, runDir) : [];

      const allSources = [...repoSources, ...wikiSources, ...memorySources, ...webSources];
      for (const source of allSources) {
        await appendSourceToRun(runDir, source);
      }
      lines.push(stepDone('Sources collected', `${allSources.length} found`));
      for (const s of allSources.slice(0, 5)) {
        lines.push(sourceLine(allSources.indexOf(s) + 1, s.title.slice(0, 50), s.type, s.trust));
      }

      // 2. Claim Extraction
      lines.push(stepStart('Extracting claims'));
      const allClaims = [];
      for (const source of allSources) {
        const text = await readSourceDocument(cwd, source);
        const extracted = extractClaimsFromText(text, source.id);
        for (const claim of extracted) {
          await appendClaimToRun(runDir, claim);
          allClaims.push(claim);
        }
      }
      lines.push(stepDone('Claims extracted', `${allClaims.length} claims`));
      for (const c of allClaims.slice(0, 5)) {
        lines.push(claimLine(allClaims.indexOf(c) + 1, c.claim, c.confidence));
      }
      if (allClaims.length > 5) lines.push(`  ${C.dim}... and ${allClaims.length - 5} more${C.reset}`);

      // 3. Synthesis
      lines.push(stepStart('Synthesizing'));
      const synthesis = await synthesizeClaims(allClaims, allSources, query);
      lines.push(
        synthesisBox({
          overallConfidence: synthesis.overallConfidence,
          summary: synthesis.summary,
          consensusCount: synthesis.consensusFindings.length,
          conflictCount: synthesis.conflicts.length,
          gapCount: synthesis.gaps.length,
        }),
      );

      // 4. Report
      lines.push(stepStart('Building report'));
      const citations = buildCitations(allSources, allClaims);
      const reportMarkdown = buildResearchReport(query, plan, allClaims, citations, synthesis);
      await writeReportToRun(runDir, reportMarkdown);
      await completeRunStore(runDir);
      lines.push(stepDone('Report ready', runId));
      lines.push('');
      lines.push(summaryFooter(runId, allSources.length, allClaims.length, citations.length));
      lines.push('');
      lines.push(reportMarkdown);

      return { type: 'text', value: lines.join('\n') };
    }

    case 'sources': {
      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found. Run a research first: `/research run "Query"`' };
      }

      const sources = await readSourcesFromRun(latest.runDir);
      if (sources.length === 0) {
        return { type: 'text', value: 'No sources collected in the latest run.' };
      }

      return {
        type: 'text',
        value: [
          `Sources for ${latest.run.id}:`,
          ...sources.map((s, i) => `${i + 1}. **[${s.id}]** ${s.title} (${s.type}) — ${s.trust} trust`),
        ].join('\n'),
      };
    }

    case 'open': {
      const sourceId = query;
      if (!sourceId) {
        return {
          type: 'text',
          value: 'Error: Please specify a source-id. Example: `/research open source:wiki:Research`.',
        };
      }

      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found.' };
      }

      const sources = await readSourcesFromRun(latest.runDir);
      const matched = sources.find(s => s.id === sourceId || s.id.endsWith(sourceId));

      if (!matched) {
        return { type: 'text', value: `Source "${sourceId}" not found in latest run.` };
      }

      const text = await readSourceDocument(cwd, matched);
      return { type: 'text', value: text };
    }

    case 'claims': {
      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found.' };
      }

      const claimsList = await readClaimsFromRun(latest.runDir);
      if (claimsList.length === 0) {
        return { type: 'text', value: 'No claims extracted in the latest run.' };
      }

      return {
        type: 'text',
        value: [
          `Claims for ${latest.run.id}:`,
          ...claimsList.map((c, i) => `${i + 1}. **[${c.id}]** ${c.claim} (${c.type}, ${c.confidence})`),
        ].join('\n'),
      };
    }

    case 'report': {
      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found.' };
      }

      const fsImpl = getFsImplementation();
      const reportPath = join(latest.runDir, 'report.md');
      if (!fsImpl.existsSync(reportPath)) {
        return { type: 'text', value: 'Report not generated for the latest run.' };
      }

      try {
        const fileContent = fsImpl.readFileSync(reportPath, { encoding: 'utf-8' });
        return { type: 'text', value: fileContent };
      } catch (err: any) {
        return { type: 'text', value: `Failed to read report: ${err.message}` };
      }
    }

    case 'save': {
      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found.' };
      }

      const reportPath = join(latest.runDir, 'report.md');
      const fsImpl = getFsImplementation();
      if (!fsImpl.existsSync(reportPath)) {
        return { type: 'text', value: 'Report not found for the latest run.' };
      }

      const reportMarkdown = fsImpl.readFileSync(reportPath, { encoding: 'utf-8' });
      const claimsList = await readClaimsFromRun(latest.runDir);

      let savedWiki = false;
      let savedMemory = false;
      let outputMessage = '';

      const saveTarget = argv[1]?.toLowerCase() || 'both';

      if (saveTarget === 'wiki' || saveTarget === 'both' || saveTarget === 'to-wiki') {
        const wikiPath = await saveReportToWiki(cwd, latest.run.query, reportMarkdown, latest.run.id);
        outputMessage += `Saved report to Wiki: \`${wikiPath}\`\n`;
        savedWiki = true;
      }

      if (saveTarget === 'memory' || saveTarget === 'both' || saveTarget === 'to-memory-pending') {
        const pendingPath = await savePendingMemory(cwd, latest.run.query, latest.run.id, claimsList);
        outputMessage += `Saved findings to Pending Memory: \`${pendingPath}\`\n`;
        savedMemory = true;
      }

      await completeRunStore(latest.runDir, savedWiki, savedMemory);

      return { type: 'text', value: outputMessage || 'No save targets selected.' };
    }

    case 'doctor': {
      const status = await getResearchWorkspaceStatus(cwd);
      const runs = await listAllRuns(cwd);

      return {
        type: 'text',
        value: [
          'Research Diagnostics:',
          `  Initialized: ${status.initialized ? 'Yes' : 'No'}`,
          `  Workspace: \`${status.researchDir}\``,
          `  Total Runs: ${runs.length}`,
          `  Latest Run: ${runs[0] ? `\`${runs[0].id}\` (${runs[0].status})` : 'None'}`,
          `  Wiki: \`${status.wikiResearchDir}\``,
          `  Pending Memory: \`${status.pendingMemoryDir}\``,
        ].join('\n'),
      };
    }

    default:
      return { type: 'text', value: `Unknown subcommand: "${subcommand}". Type "/research" to see valid commands.` };
  }
};
