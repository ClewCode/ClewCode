// Clew taste-1: Reward model that maps signal types to numeric rewards

import { EDIT_REWARD, REWARD_VALUES, type TasteSignalType } from './Taste1Types.js';

export type RewardInput = {
  type: TasteSignalType;
  changeRatio?: number; // 0-1 for edit events
};

export type RewardOutput = {
  reward: number;
  label: string;
};

/**
 * Maps signal types to reward values.
 * Accept = +1, reject = -1, test pass = +0.4, etc.
 * Edit rewards are dynamically computed from change ratio.
 */
export function computeReward(input: RewardInput): RewardOutput {
  if (input.type === 'edit' && input.changeRatio !== undefined) {
    const reward =
      input.changeRatio <= 0.1 ? EDIT_REWARD.tiny : input.changeRatio <= 0.4 ? EDIT_REWARD.medium : EDIT_REWARD.heavy;
    const label = input.changeRatio <= 0.1 ? 'tiny_edit' : input.changeRatio <= 0.4 ? 'medium_edit' : 'heavy_edit';
    return { reward, label };
  }

  return {
    reward: REWARD_VALUES[input.type] ?? 0,
    label: input.type,
  };
}

/**
 * Batch compute rewards for multiple events.
 */
export function computeBatchRewards(inputs: RewardInput[]): RewardOutput[] {
  return inputs.map(computeReward);
}
