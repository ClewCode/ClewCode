export type BaselineData = {
  id: string;
  overallScore: number;
  categoryScores: Record<string, number>;
  taskScores: Record<string, number>;
  taskStatuses: Record<string, string>;
};

export function compareRunToBaseline(
  results: Array<{ taskId: string; score: number; status: string }>,
  baseline: BaselineData,
): { baselineId: string; overallScoreDelta: number } {
  const overallScore =
    results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.score, 0) / results.length;
  return {
    baselineId: baseline.id,
    overallScoreDelta: overallScore - baseline.overallScore,
  };
}
