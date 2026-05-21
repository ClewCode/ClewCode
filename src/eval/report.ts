import { writeFile } from 'fs/promises';
import { join } from 'path';
import { redactSecrets } from '../memory/redact.js';
import type { EvalConfig, EvalReport, EvalResult, EvalTask } from './types.js';

export function generateEvalReport(
  runId: string,
  results: EvalResult[],
  tasks: EvalTask[],
  baselineId?: string,
  baselineScore?: number,
): EvalReport {
  let totalScore = 0;
  const categoryScores: Record<string, { sum: number; count: number }> = {};
  const failures: EvalReport['failures'] = [];
  const criticalFailures: EvalReport['criticalFailures'] = [];

  let passedTasks = 0;
  let failedTasks = 0;

  for (const res of results) {
    totalScore += res.score;
    const category = res.taskId.split('.')[0] || 'coding';
    if (!categoryScores[category]) {
      categoryScores[category] = { sum: 0, count: 0 };
    }
    categoryScores[category].sum += res.score;
    categoryScores[category].count += 1;

    if (res.status === 'pass' || res.status === 'partial') {
      passedTasks += 1;
    } else {
      failedTasks += 1;
    }

    const hasCritical = res.failureReasons.some(reason => reason.includes('CRITICAL FAILURE'));
    if (hasCritical) {
      const critReason = res.failureReasons.find(r => r.includes('CRITICAL FAILURE')) || 'Unknown critical failure';
      criticalFailures.push({
        taskId: res.taskId,
        reason: redactSecrets(critReason),
      });
    }

    if (res.status === 'fail' || res.status === 'error') {
      failures.push({
        taskId: res.taskId,
        status: res.status,
        score: res.score,
        failureReasons: res.failureReasons.map(r => redactSecrets(r)),
      });
    }
  }

  const overallScore = results.length > 0 ? totalScore / results.length : 1.0;
  const finalCategoryScores: Record<string, number> = {};
  for (const cat of Object.keys(categoryScores)) {
    finalCategoryScores[cat] = categoryScores[cat].sum / categoryScores[cat].count;
  }

  let regression: EvalReport['regression'];
  if (baselineId !== undefined && baselineScore !== undefined) {
    const delta = overallScore - baselineScore;
    // Degraded if overall score drops by more than 5%
    const status = delta < -0.05 ? 'fail' : 'pass';
    regression = {
      baselineId,
      delta,
      status,
    };
  }

  return {
    runId,
    generatedAt: new Date().toISOString(),
    summary: {
      overallScore,
      categoryScores: finalCategoryScores,
      passedTasks,
      failedTasks,
      totalTasks: results.length,
    },
    regression,
    failures,
    criticalFailures,
  };
}

export function formatReportToMarkdown(report: EvalReport): string {
  const lines: string[] = [
    `# Eval Report — ${report.runId}`,
    '',
    '## Summary',
    '',
    '| Category | Score |',
    '|---|---:|',
    `| **Overall** | **${report.summary.overallScore.toFixed(2)}** |`,
  ];

  for (const [cat, score] of Object.entries(report.summary.categoryScores)) {
    // Capitalize category name
    const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`| ${catName} | ${score.toFixed(2)} |`);
  }

  lines.push('');

  if (report.regression) {
    const deltaStr =
      report.regression.delta >= 0 ? `+${report.regression.delta.toFixed(2)}` : report.regression.delta.toFixed(2);
    lines.push('## Regression Comparison', '');
    lines.push(`- **Baseline:** ${report.regression.baselineId}`);
    lines.push(`- **Delta:** ${deltaStr}`);
    lines.push(`- **Status:** ${report.regression.status.toUpperCase()}`);
    lines.push('');
  }

  if (report.criticalFailures.length > 0) {
    lines.push('## ⚠️ CRITICAL FAILURES', '');
    for (const crit of report.criticalFailures) {
      lines.push(`### Task: \`${crit.taskId}\``);
      lines.push(`- **Reason:** ${crit.reason}`);
      lines.push('');
    }
  }

  if (report.failures.length > 0) {
    lines.push('## Failures', '');
    for (const fail of report.failures) {
      lines.push(`### Task: \`${fail.taskId}\``);
      lines.push(`- **Status:** ${fail.status}`);
      lines.push(`- **Score:** ${fail.score.toFixed(2)}`);
      lines.push('- **Failure Reasons:**');
      for (const reason of fail.failureReasons) {
        lines.push(`  - ${reason}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## All Tasks Passed Successfully! 🎉', '');
  }

  return lines.join('\n');
}

export async function writeReportFiles(config: EvalConfig, report: EvalReport, runDir: string): Promise<void> {
  const mdContent = formatReportToMarkdown(report);
  const jsonContent = JSON.stringify(report, null, 2);

  // Write in run-specific folder
  await writeFile(join(runDir, 'report.md'), mdContent, 'utf-8');
  await writeFile(join(runDir, 'report.json'), jsonContent, 'utf-8');

  // Also write to global reports folder as latest
  await writeFile(join(config.reportsDir, 'latest.md'), mdContent, 'utf-8');
  await writeFile(join(config.reportsDir, 'latest.json'), jsonContent, 'utf-8');
  await writeFile(join(config.reportsDir, `report-${report.runId}.md`), mdContent, 'utf-8');
}
