// Clew taste: Compute reward from edit distance analysis

import { computeEditDistance, type DiffStats, editDistanceReward } from './DiffSignalExtractor.js';

export type EditRewardInput = {
  before: string;
  after: string;
};

export type EditRewardResult = {
  reward: number;
  stats: DiffStats;
  category: 'tiny' | 'medium' | 'heavy';
};

/**
 * Compute the reward value for an edit action based on diff size.
 * Small, focused edits get positive reward; large rewrites get negative.
 */
export function computeEditReward(input: EditRewardInput): EditRewardResult {
  const stats = computeEditDistance(input.before, input.after);
  const reward = editDistanceReward(stats);

  let category: 'tiny' | 'medium' | 'heavy';
  if (stats.changeRatio <= 0.1) category = 'tiny';
  else if (stats.changeRatio <= 0.4) category = 'medium';
  else category = 'heavy';

  return { reward, stats, category };
}
