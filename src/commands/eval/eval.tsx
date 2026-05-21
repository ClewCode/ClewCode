import { mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import type * as React from 'react';
import { runTaskWithAgent } from '../../eval/agentRunner.js';
// Plan G imports
import { getEvalConfig } from '../../eval/config.js';
import { runDiagnostics } from '../../eval/doctor.js';
import { gradeWithGrader } from '../../eval/graders/index.js';
import { compareRunToBaseline, loadBaseline } from '../../eval/regression.js';
import { formatReportToMarkdown, generateEvalReport, writeReportFiles } from '../../eval/report.js';
import { computeTaskScore } from '../../eval/scoring.js';
import { loadGraders, loadTasks } from '../../eval/taskLoader.js';
import type { EvalResult } from '../../eval/types.js';
import { initializeEvalWorkspace } from '../../eval/workspace.js';
import { Box, Text } from '../../ink.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { logError } from '../../utils/log.js';

function parseArgs(argsStr: string): Record<string, string | boolean> {
  const options: Record<string, string | boolean> = {};
  const argv = argsStr.trim().split(/\s+/).filter(Boolean);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[key] = argv[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options[key] = argv[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return options;
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const cwd = process.cwd();
  const argv = args.trim().split(/\s+/).filter(Boolean);
  const subcommand = argv[0]?.toLowerCase();

  if (!subcommand) {
    onDone(
      [
        'Verification Harness Subcommands:',
        '  eval init           - Initialize the evaluation workspace structure',
        '  eval run            - Run evaluation tasks (--set <cat>, --task <id>, --baseline <base>)',
        '  eval compare        - Compare the latest run against baseline (--baseline <base>)',
        '  eval report         - Print the latest formatted report',
        '  eval trace <task>   - Display steps of the latest run of a task',
        '  eval doctor         - Diagnose task/grader schema and paths health',
      ].join('\n'),
      { display: 'system' },
    );
    return null;
  }

  const config = getEvalConfig(cwd);
  const fsImpl = getFsImplementation();

  switch (subcommand) {
    case 'init': {
      try {
        await initializeEvalWorkspace(cwd);
        onDone('🟢 Ceph Verification Harness workspace successfully initialized under `.ceph/evals/`', {
          display: 'system',
        });
      } catch (err: any) {
        onDone(`🔴 Workspace initialization failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    case 'run': {
      try {
        const options = parseArgs(args.slice(subcommand.length));
        const categoryFilter = (options.set || options.s) as string;
        const taskIdFilter = (options.task || options.t) as string;
        const baselineId = (options.baseline || options.b) as string;

        const tasks = await loadTasks(config);
        const graders = await loadGraders(config);

        if (tasks.length === 0) {
          onDone('🔴 No tasks found. Run "cephcode eval init" to create default tasks and graders.', {
            display: 'system',
          });
          return null;
        }

        // Filter tasks
        let filteredTasks = tasks;
        if (taskIdFilter) {
          filteredTasks = tasks.filter(t => t.id === taskIdFilter);
        } else if (categoryFilter) {
          filteredTasks = tasks.filter(t => t.category === categoryFilter);
        }

        if (filteredTasks.length === 0) {
          onDone(
            `🔴 No tasks matched the filter (Task: ${taskIdFilter || 'N/A'}, Category: ${categoryFilter || 'N/A'})`,
            {
              display: 'system',
            },
          );
          return null;
        }

        const runId = `run-${Date.now()}`;
        const runDir = join(config.runsDir, runId);
        await mkdir(runDir, { recursive: true });

        const results: EvalResult[] = [];

        for (const task of filteredTasks) {
          // Execute task via simulator/agentRunner
          const runResult = await runTaskWithAgent(task, runId, runDir, cwd);

          // Grade the results using mapped task graders
          const graderResults = [];
          for (const graderId of task.graders) {
            const graderConfig = graders.find(g => g.id === graderId);
            if (graderConfig) {
              const graderRes = await gradeWithGrader(graderConfig, task, {
                workspaceDir: join(runDir, `workspace_${task.id}`),
                tracePath: runResult.tracePath,
                agentOutput: runResult.agentOutput,
                changedFiles: runResult.changedFiles,
              });
              graderResults.push(graderRes);
            }
          }

          // Compute overall score
          const evalRes = computeTaskScore(
            task,
            graderResults,
            runResult.metrics,
            join(runDir, `workspace_${task.id}`),
            runResult.changedFiles,
            runResult.agentOutput,
            runResult.executedCommands,
          );
          evalRes.runId = runId;
          evalRes.tracePath = runResult.tracePath;

          results.push(evalRes);
        }

        // Load baseline data if provided
        let baselineScore: number | undefined;
        if (baselineId) {
          const baselineData = await loadBaseline(config, baselineId);
          if (baselineData) {
            baselineScore = baselineData.overallScore;
          }
        }

        // Compile report
        const report = generateEvalReport(runId, results, filteredTasks, baselineId, baselineScore);
        await writeReportFiles(config, report, runDir);

        const mdReport = formatReportToMarkdown(report);
        onDone(`🟢 Evaluation completed successfully!\n\n${mdReport}`, { display: 'system' });
      } catch (err: any) {
        onDone(`🔴 Evaluation run failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    case 'compare': {
      try {
        const options = parseArgs(args.slice(subcommand.length));
        const baselineId = (options.baseline || options.b) as string;

        if (!baselineId) {
          onDone('🔴 Please specify the baseline ID. Example: "/eval compare --baseline main"', {
            display: 'system',
          });
          return null;
        }

        const baseline = await loadBaseline(config, baselineId);
        if (!baseline) {
          onDone(`🔴 Baseline "${baselineId}" not found in .ceph/evals/baselines/`, { display: 'system' });
          return null;
        }

        const reportPath = join(config.reportsDir, 'latest.json');
        if (!fsImpl.existsSync(reportPath)) {
          onDone('🔴 No recent eval run found to compare. Please run "/eval run" first.', {
            display: 'system',
          });
          return null;
        }

        const reportContent = await readFile(reportPath, 'utf-8');
        const latestReport = JSON.parse(reportContent);

        // Print comparative metrics
        const delta = latestReport.summary.overallScore - baseline.overallScore;
        const deltaStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);

        const comparisonLines = [
          `# Eval Comparison: Latest vs. ${baseline.id}`,
          '',
          `- **Latest Score:** ${latestReport.summary.overallScore.toFixed(2)}`,
          `- **Baseline Score:** ${baseline.overallScore.toFixed(2)}`,
          `- **Score Drift (Delta):** ${deltaStr}`,
          `- **Status:** ${delta < -0.05 ? '🚨 REGRESSED' : '✅ STABLE / IMPROVED'}`,
          '',
        ];

        onDone(comparisonLines.join('\n'), { display: 'system' });
      } catch (err: any) {
        onDone(`🔴 Compare failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    case 'report': {
      try {
        const reportPath = join(config.reportsDir, 'latest.md');
        if (!fsImpl.existsSync(reportPath)) {
          onDone('🔴 No recent eval report found. Run "/eval run" first.', { display: 'system' });
          return null;
        }

        const mdReport = await readFile(reportPath, 'utf-8');
        onDone(mdReport, { display: 'system' });
      } catch (err: any) {
        onDone(`🔴 Report reading failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    case 'trace': {
      try {
        const taskId = argv[1];
        if (!taskId) {
          onDone('🔴 Please specify the taskId. Example: "/eval trace coding.sample-task"', {
            display: 'system',
          });
          return null;
        }

        const reportPath = join(config.reportsDir, 'latest.json');
        if (!fsImpl.existsSync(reportPath)) {
          onDone('🔴 No recent eval run found to query. Please run "/eval run" first.', {
            display: 'system',
          });
          return null;
        }

        const reportContent = await readFile(reportPath, 'utf-8');
        const latestReport = JSON.parse(reportContent);
        const runId = latestReport.runId;

        const runDir = join(config.runsDir, runId);
        const traceFile = join(runDir, `run-${taskId}-events.jsonl`);

        if (!fsImpl.existsSync(traceFile)) {
          onDone(`🔴 Trace file for task "${taskId}" in run "${runId}" not found.`, { display: 'system' });
          return null;
        }

        const traceContent = await readFile(traceFile, 'utf-8');
        const events = traceContent
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line));

        const traceLines = [
          `# Run ${runId} Trace for ${taskId}`,
          '',
          ...events.map(
            (e: any) =>
              `- [${new Date(e.timestamp).toLocaleTimeString()}] **${e.type}**: ${e.message} ${
                e.metadata ? `(metadata: ${JSON.stringify(e.metadata)})` : ''
              }`,
          ),
        ];

        onDone(traceLines.join('\n'), { display: 'system' });
      } catch (err: any) {
        onDone(`🔴 Trace reading failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    case 'doctor': {
      try {
        const res = await runDiagnostics(cwd);
        const checkLines = [
          '# Verification Harness Doctor Diagnostic Reports',
          '',
          `- **Harness Initialized:** ${res.initialized ? '🟢 Yes' : '🔴 No'}`,
          `- **Eval Tasks Count:** ${res.tasksCount}`,
          `- **Custom Graders Count:** ${res.gradersCount}`,
          `- **Total Runs Logged:** ${res.runsCount}`,
          `- **Total Baselines Count:** ${res.baselinesCount}`,
          '',
        ];

        if (res.errors.length > 0) {
          checkLines.push('## Diagnostic Errors Detected:');
          for (const err of res.errors) {
            checkLines.push(`- ⚠️ ${err}`);
          }
        } else {
          checkLines.push('🟢 All workspace folder boundaries and syntax structures look fully healthy!');
        }

        onDone(checkLines.join('\n'), { display: 'system' });
      } catch (err: any) {
        onDone(`🔴 Diagnostic checker failed: ${err.message}`, { display: 'system' });
      }
      return null;
    }

    default: {
      onDone(`🔴 Unknown subcommand: "${subcommand}".`, { display: 'system' });
      return null;
    }
  }
};

export default function EvalCommand({
  onDone,
}: {
  onDone: (
    result?: string,
    options?: {
      display?: CommandResultDisplay;
    },
  ) => void;
}): React.ReactNode {
  // Return default placeholder
  return null;
}
