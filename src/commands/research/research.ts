import { join } from 'path';
import { buildCitations, formatBibliography } from '../../research/citations.js';
import { extractClaimsFromText } from '../../research/claims.js';
import { collectLocalMemory } from '../../research/collectors/localMemory.js';
import { collectLocalRepo } from '../../research/collectors/localRepo.js';
import { collectLocalWiki } from '../../research/collectors/localWiki.js';
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
import type { ResearchMode } from '../../research/types.js';
import { getResearchWorkspaceStatus, initWorkspace } from '../../research/workspace.js';
import type { LocalCommandCall } from '../../types/command.js';
import { getFsImplementation } from '../../utils/fsOperations.js';

export const call: LocalCommandCall = async (args, context) => {
  const cwd = process.cwd();
  const argv = args.trim().split(/\s+/);
  const subcommand = argv[0]?.toLowerCase();

  if (!subcommand) {
    return {
      type: 'text',
      value: [
        'Usage: /research <subcommand> [args]',
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

  const queryAndFlags = argv.slice(1).join(' ');

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
      return {
        type: 'text',
        value: '🟢 Research workspace directories initialized successfully under `.ceph/`',
      };
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
          `🟢 Research Plan generated for: "${query}" (Mode: ${mode})`,
          `Saved to run directory: \`${runDir}\``,
          '',
          `**Sub-questions:**`,
          ...plan.subQuestions.map((q, i) => `  ${i + 1}. ${q}`),
          '',
          `**Expected Sources:** ${plan.sourceStrategy.join(', ')}`,
          `**Done Criteria:** ${plan.doneCriteria.join(', ')}`,
          `**Risks Identified:** ${plan.risks.join(', ')}`,
        ].join('\n'),
      };
    }

    case 'run': {
      if (!query) {
        return { type: 'text', value: 'Error: Please specify a research query. Example: `/research run GrowthBook`.' };
      }

      await initWorkspace(cwd);
      const plan = createResearchPlan(query, mode);
      const { runId, runDir } = await createRunStore(cwd, query, mode);
      await writePlanToRun(runDir, plan);

      console.log(`[Research Run] Starting pipeline for run ${runId}`);

      // 1. Source Collection
      console.log('[Research Run] Collecting sources...');
      const repoSources = plan.sourceStrategy.includes('local_repo') ? await collectLocalRepo(cwd, query) : [];
      const wikiSources = plan.sourceStrategy.includes('local_wiki') ? await collectLocalWiki(cwd, query) : [];
      const memorySources = plan.sourceStrategy.includes('local_memory') ? await collectLocalMemory(cwd, query) : [];

      const allSources = [...repoSources, ...wikiSources, ...memorySources];
      for (const source of allSources) {
        await appendSourceToRun(runDir, source);
      }

      // 2. Claim Extraction
      console.log('[Research Run] Extracting claims...');
      const allClaims = [];
      for (const source of allSources) {
        const text = await readSourceDocument(cwd, source);
        const extracted = extractClaimsFromText(text, source.id);
        for (const claim of extracted) {
          await appendClaimToRun(runDir, claim);
          allClaims.push(claim);
        }
      }

      // 3. Citations & Report Assembly
      console.log('[Research Run] Building report...');
      const citations = buildCitations(allSources, allClaims);
      const reportMarkdown = buildResearchReport(query, plan, allClaims, citations);
      await writeReportToRun(runDir, reportMarkdown);

      await completeRunStore(runDir);

      return {
        type: 'text',
        value: [
          `🟢 Research Run completed successfully!`,
          `Run ID: \`${runId}\``,
          `Collected Sources: ${allSources.length}`,
          `Extracted Claims: ${allClaims.length}`,
          `Citations Map: ${citations.length} sources used`,
          '',
          reportMarkdown,
        ].join('\n'),
      };
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
          `Collected Sources for Latest Run (${latest.run.id}):`,
          ...sources.map((s, i) => `${i + 1}. **[${s.id}]** ${s.title} (${s.type}) - Path: \`${s.path || 'N/A'}\``),
        ].join('\n'),
      };
    }

    case 'open': {
      const sourceId = query; // argv[1]
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
        return { type: 'text', value: `Error: Source with ID "${sourceId}" not found in latest run.` };
      }

      const text = await readSourceDocument(cwd, matched);
      return { type: 'text', value: text };
    }

    case 'claims': {
      const latest = await getLatestRun(cwd);
      if (!latest) {
        return { type: 'text', value: 'No research runs found.' };
      }

      const claims = await readClaimsFromRun(latest.runDir);
      if (claims.length === 0) {
        return { type: 'text', value: 'No claims extracted in the latest run.' };
      }

      return {
        type: 'text',
        value: [
          `Extracted Claims for Latest Run (${latest.run.id}):`,
          ...claims.map(
            (c, i) =>
              `${i + 1}. **[${c.id}]** ${c.claim} (Type: ${c.type}, Confidence: ${c.confidence}, Status: ${c.status})`,
          ),
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
      const claims = await readClaimsFromRun(latest.runDir);

      let savedWiki = false;
      let savedMemory = false;
      let outputMessage = '';

      const saveTarget = argv[1]?.toLowerCase() || 'both';

      if (saveTarget === 'wiki' || saveTarget === 'both' || saveTarget === 'to-wiki') {
        const wikiPath = await saveReportToWiki(cwd, latest.run.query, reportMarkdown, latest.run.id);
        outputMessage += `🟢 Saved report to Wiki at: \`${wikiPath}\`\n`;
        savedWiki = true;
      }

      if (saveTarget === 'memory' || saveTarget === 'both' || saveTarget === 'to-memory-pending') {
        const pendingPath = await savePendingMemory(cwd, latest.run.query, latest.run.id, claims);
        outputMessage += `🟢 Proposed findings to Pending Memory at: \`${pendingPath}\`\n`;
        savedMemory = true;
      }

      await completeRunStore(latest.runDir, savedWiki, savedMemory);

      return {
        type: 'text',
        value: outputMessage || 'No save targets selected.',
      };
    }

    case 'doctor': {
      const status = await getResearchWorkspaceStatus(cwd);
      const runs = await listAllRuns(cwd);

      return {
        type: 'text',
        value: [
          'Research Agent Diagnostics:',
          `  Initialized: ${status.initialized ? 'Yes 🟢' : 'No 🔴'}`,
          `  Workspace Path: \`${status.researchDir}\``,
          `  Total Runs Logged: ${runs.length}`,
          `  Latest Run: ${runs[0] ? `\`${runs[0].id}\` (Status: ${runs[0].status})` : 'None'}`,
          `  Wiki Directory: \`${status.wikiResearchDir}\``,
          `  Pending Memory Directory: \`${status.pendingMemoryDir}\``,
          `  Index Directory: \`${status.indexDir}\``,
        ].join('\n'),
      };
    }

    default:
      return { type: 'text', value: `Unknown subcommand: "${subcommand}". Type "/research" to see valid commands.` };
  }
};
