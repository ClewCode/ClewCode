import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import type { EvalComparison, EvalConfig, EvalReport, EvalResult } from './types.js';

export interface BaselineData {
  id: string;
  overallScore: number;
  categoryScores: Record<string, number>;
  taskScores: Record<string, number>;
  taskStatuses: Record<string, string>;
}

export async function loadBaseline(config: EvalConfig, baselineId: string): Promise<BaselineData | null> {
  const fsImpl = getFsImplementation();
  const filePath = join(config.baselinesDir, `${baselineId}.json`);

  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as BaselineData;
  } catch (err) {
    console.error(`Failed to load baseline ${baselineId}:`, err);
    return null;
  }
}

export async function saveBaseline(config: EvalConfig, baselineId: string, data: BaselineData): Promise<void> {
  const filePath = join(config.baselinesDir, `${baselineId}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function compareRunToBaseline(results: EvalResult[], baseline: BaselineData): EvalComparison {
  let totalScore = 0;
  const categoryScores: Record<string, { sum: number; count: number }> = {};
  const taskComparisons: EvalComparison['taskComparisons'] = [];

  for (const res of results) {
    totalScore += res.score;
    // We assume a naming standard like "coding.xxx" where first part before "." is category
    const category = res.taskId.split('.')[0] || 'coding';
    if (!categoryScores[category]) {
      categoryScores[category] = { sum: 0, count: 0 };
    }
    categoryScores[category].sum += res.score;
    categoryScores[category].count += 1;

    const baseScore = baseline.taskScores[res.taskId] ?? 0.0;
    const baseStatus = baseline.taskStatuses[res.taskId] ?? 'fail';

    taskComparisons.push({
      taskId: res.taskId,
      currentScore: res.score,
      baselineScore: baseScore,
      currentStatus: res.status,
      baselineStatus: baseStatus,
    });
  }

  const overallScore = results.length > 0 ? totalScore / results.length : 1.0;
  const currentCategories: Record<string, number> = {};
  const categoryDeltas: Record<string, number> = {};

  for (const cat of Object.keys(categoryScores)) {
    const cur = categoryScores[cat].sum / categoryScores[cat].count;
    currentCategories[cat] = cur;
    const base = baseline.categoryScores[cat] ?? 0.0;
    categoryDeltas[cat] = cur - base;
  }

  return {
    runId: results[0]?.runId || '',
    baselineId: baseline.id,
    overallScoreDelta: overallScore - baseline.overallScore,
    categoryDeltas,
    taskComparisons,
  };
}
