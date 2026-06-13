export function generateEvalReport(results: Array<{ taskId: string; score: number; status: string }>): {
  overallScore: number;
  results: Array<{ taskId: string; score: number; status: string }>;
} {
  const overallScore =
    results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.score, 0) / results.length;
  return { overallScore, results };
}

export function formatReportToMarkdown(report: ReturnType<typeof generateEvalReport>): string {
  return [
    '# Eval Report',
    '',
    `Overall Score: ${report.overallScore.toFixed(2)}`,
    '',
    ...report.results.map(result => `- ${result.taskId}: ${result.status} (${result.score.toFixed(2)})`),
    '',
  ].join('\n');
}
