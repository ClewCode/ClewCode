import type * as React from 'react';
import { useEffect, useState } from 'react';
import { ResearchProgressPanel, type ResearchProgressState } from '../../components/ResearchProgress.js';
import { Box } from '../../ink.js';
import { buildCitations } from '../../research/citations.js';
import { extractClaimsFromText } from '../../research/claims.js';
import { collectLocalMemory } from '../../research/collectors/localMemory.js';
import { collectLocalRepo } from '../../research/collectors/localRepo.js';
import { collectLocalWiki } from '../../research/collectors/localWiki.js';
import { collectWebSearch } from '../../research/collectors/webSearch.js';
import { createResearchPlan } from '../../research/planner.js';
import { buildResearchReport } from '../../research/reportBuilder.js';
import {
  appendClaimToRun,
  appendSourceToRun,
  completeRunStore,
  createRunStore,
  writePlanToRun,
  writeReportToRun,
} from '../../research/runStore.js';
import { readSourceDocument } from '../../research/sourceReader.js';
import { synthesizeClaims } from '../../research/synthesizer.js';
import type { ResearchMode } from '../../research/types.js';
import { initWorkspace } from '../../research/workspace.js';
import { rankSources } from '../../tools/ResearchTool/smartSourceRanking.js';
import {
  assessSourceCredibility,
  detectConflicts,
  generateTruthCheckSummary,
} from '../../tools/ResearchTool/truthChecker.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getCwd } from '../../utils/cwd.js';
import { getFsImplementation } from '../../utils/fsOperations.js';

interface DeepResearchRunnerViewProps {
  query: string;
  mode: ResearchMode;
  onDone: LocalJSXCommandOnDone;
}

function DeepResearchRunnerView({ query, mode, onDone }: DeepResearchRunnerViewProps) {
  const [state, setState] = useState<ResearchProgressState>({
    query,
    mode,
    phase: 'planning',
    phaseIndex: 0,
    totalPhases: 5,
    collectors: [
      { name: 'local_repo', status: 'pending', resultCount: 0, durationMs: 0 },
      { name: 'local_wiki', status: 'pending', resultCount: 0, durationMs: 0 },
      { name: 'local_memory', status: 'pending', resultCount: 0, durationMs: 0 },
      { name: 'web', status: 'pending', resultCount: 0, durationMs: 0 },
    ],
    sourceCount: 0,
    claimCount: 0,
    consensusCount: 0,
    conflictCount: 0,
    elapsedMs: 0,
  });

  useEffect(() => {
    let active = true;
    const start = Date.now();

    const timer = setInterval(() => {
      if (active) {
        setState(prev => ({
          ...prev,
          elapsedMs: Date.now() - start,
        }));
      }
    }, 100);

    async function runPipeline() {
      const cwd = getCwd();
      try {
        // 0. Planning Phase
        setState(prev => ({ ...prev, phase: 'planning', phaseIndex: 0 }));
        await initWorkspace(cwd);
        const plan = createResearchPlan(query, mode);
        const { runId, runDir } = await createRunStore(cwd, query, mode);
        await writePlanToRun(runDir, plan);

        if (!active) return;

        // Wire LLM if available globally
        const plannerLlm = (globalThis as any).__ultracodePlannerLlm;
        const ask = plannerLlm
          ? async (prompt: string) => {
              return plannerLlm({
                systemPrompt: 'You are a research assistant synthesizing claims. Return only valid JSON.',
                userPrompt: prompt,
              });
            }
          : undefined;

        let currentQueries = [query];
        const allSources: any[] = [];
        const allClaims: any[] = [];
        const seenUrls = new Set<string>();

        let round = 1;
        const maxRounds = 2; // Iterative loop cap (max 2 rounds to be fast but thorough)
        let synthesis: any = null;

        while (round <= maxRounds) {
          if (!active) return;

          // 1. Source Collection Phase
          if (active) {
            setState(prev => ({
              ...prev,
              phase: 'collecting',
              phaseIndex: 1,
              collectors: prev.collectors.map(c => ({
                ...c,
                status: plan.sourceStrategy.includes(c.name as any) ? 'running' : 'pending',
              })),
            }));
          }

          const collectorPromises = [];
          for (const q of currentQueries) {
            collectorPromises.push(
              plan.sourceStrategy.includes('local_repo') ? collectLocalRepo(cwd, q) : Promise.resolve([]),
              plan.sourceStrategy.includes('local_wiki') ? collectLocalWiki(cwd, q) : Promise.resolve([]),
              plan.sourceStrategy.includes('local_memory') ? collectLocalMemory(cwd, q) : Promise.resolve([]),
              plan.sourceStrategy.includes('web') ? collectWebSearch(cwd, q, runDir) : Promise.resolve([]),
            );
          }

          const results = await Promise.all(
            collectorPromises.map(async (fn, idx) => {
              const name = ['local_repo', 'local_wiki', 'local_memory', 'web'][idx % 4]!;
              const colStart = Date.now();
              try {
                const res = await fn;
                const duration = Date.now() - colStart;
                if (active) {
                  setState(prev => ({
                    ...prev,
                    collectors: prev.collectors.map(c =>
                      c.name === name
                        ? {
                            ...c,
                            status: 'completed',
                            resultCount: c.resultCount + res.length,
                            durationMs: c.durationMs + duration,
                          }
                        : c,
                    ),
                  }));
                }
                return res;
              } catch (err) {
                if (active) {
                  setState(prev => ({
                    ...prev,
                    collectors: prev.collectors.map(c =>
                      c.name === name
                        ? { ...c, status: 'failed', durationMs: c.durationMs + (Date.now() - colStart) }
                        : c,
                    ),
                  }));
                }
                return [];
              }
            }),
          );

          if (!active) return;

          const roundSources = results.flat();
          // Filter duplicates
          const newSources = [];
          for (const src of roundSources) {
            const key = src.url || src.path || src.title;
            if (!seenUrls.has(key)) {
              seenUrls.add(key);
              newSources.push(src);
            }
          }

          if (newSources.length > 0) {
            // Smart ranking
            const ranked = rankSources(
              newSources.map(s => ({
                url: s.url || s.path || '',
                title: s.title,
                excerpt: s.excerpt || '',
                content: '',
                type: s.type,
              })),
              { preferOfficial: true, excludeSpam: true, minScore: 0 },
            );
            const scoreMap = new Map(ranked.map(r => [r.url || r.title, r.score]));
            newSources.sort((a, b) => {
              const aKey = a.url || a.path || a.title;
              const bKey = b.url || b.path || b.title;
              return (scoreMap.get(bKey) ?? 50) - (scoreMap.get(aKey) ?? 50);
            });

            for (const source of newSources) {
              await appendSourceToRun(runDir, source);
              allSources.push(source);
            }
          }

          if (active) {
            setState(prev => ({
              ...prev,
              sourceCount: allSources.length,
            }));
          }

          // 2. Claim Extraction Phase
          if (active) {
            setState(prev => ({ ...prev, phase: 'extracting', phaseIndex: 2 }));
          }

          const newClaims = [];
          for (const source of newSources) {
            if (!active) return;
            const text = await readSourceDocument(cwd, source);
            const extracted = extractClaimsFromText(text, source.id);
            for (const claim of extracted) {
              await appendClaimToRun(runDir, claim);
              allClaims.push(claim);
              newClaims.push(claim);
            }
            if (active) {
              setState(prev => ({
                ...prev,
                claimCount: allClaims.length,
              }));
            }
          }

          // 3. Synthesis Phase
          if (active) {
            setState(prev => ({ ...prev, phase: 'synthesizing', phaseIndex: 3 }));
          }

          synthesis = await synthesizeClaims(allClaims, allSources, query, ask);

          if (active) {
            setState(prev => ({
              ...prev,
              consensusCount: synthesis.consensusFindings.length,
              conflictCount: synthesis.conflicts.length,
            }));
          }

          // Gap-filling loop: if synthesis discovers gaps, trigger round 2 with the gaps as queries
          if (synthesis.gaps && synthesis.gaps.length > 0 && round < maxRounds) {
            currentQueries = synthesis.gaps.slice(0, 2);
            round++;
          } else {
            break;
          }
        }

        // 4. Report Building Phase
        if (active) {
          setState(prev => ({ ...prev, phase: 'reporting', phaseIndex: 4 }));
        }

        const citations = buildCitations(allSources, allClaims);
        const reportMarkdown = buildResearchReport(query, plan, allClaims, citations, synthesis);

        // Add Truth Check info into report if conflicts detected
        let finalReport = reportMarkdown;
        const webWithUrls = allSources.filter(s => s.url);
        if (webWithUrls.length > 1) {
          const credibilityScores = webWithUrls.map(s => assessSourceCredibility(s.url!));
          const sourcesForConflict = webWithUrls
            .filter(s => s.excerpt)
            .map(s => ({ url: s.url!, title: s.title, content: s.excerpt! }));
          const conflicts = detectConflicts(sourcesForConflict, query);
          if (conflicts.length > 0) {
            const truthCheck = generateTruthCheckSummary(conflicts, credibilityScores, query);
            const truthCheckSection = [
              '',
              '## Truth Check & Conflict Resolution',
              '',
              `> ${truthCheck.summary}`,
              '',
              `**Potential Conflicts Detected:** ${conflicts.length}`,
              ...conflicts.map(
                (c, i) =>
                  `${i + 1}. **Topic:** ${c.topic}\n   - **Opinion A:** ${c.claimA}\n   - **Opinion B:** ${c.claimB}`,
              ),
              '',
            ].join('\n');
            finalReport = reportMarkdown.replace('## Bibliography', `${truthCheckSection}\n\n## Bibliography`);
          }
        }

        await writeReportToRun(runDir, finalReport);
        await completeRunStore(runDir);

        if (active) {
          setState(prev => ({ ...prev, phase: 'completed', phaseIndex: 5 }));
          clearInterval(timer);
          onDone(finalReport);
        }
      } catch (err: any) {
        clearInterval(timer);
        if (active) {
          setState(prev => ({
            ...prev,
            phase: 'failed',
            error: err.message || String(err),
          }));
          onDone(`Deep Research failed: ${err.message || String(err)}`);
        }
      }
    }

    void runPipeline();

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [query, mode, onDone]);

  return (
    <Box flexDirection="column">
      <ResearchProgressPanel state={state} />
    </Box>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const trimmed = args?.trim() || '';

  if (!trimmed) {
    onDone(
      'Usage:\n' +
        '  /research deep <query>                    Run full parallel deep research\n' +
        '  /research deep <query> --mode <mode>      Specify mode (quick|deep|compare|security|...)',
    );
    return null;
  }

  // Parse mode flag
  let mode: ResearchMode = 'deep';
  let query = trimmed;

  if (trimmed.includes('--mode')) {
    const modeIdx = trimmed.indexOf('--mode');
    const modePart = trimmed
      .slice(modeIdx + 6)
      .trim()
      .split(/\s+/)[0];
    if (modePart) {
      mode = modePart as ResearchMode;
    }
    query = trimmed.slice(0, modeIdx).trim();
  }

  return <DeepResearchRunnerView query={query} mode={mode} onDone={onDone} />;
}
