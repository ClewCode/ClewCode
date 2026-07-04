import type { Command } from '../../commands.js';
import { isPolicyAllowed } from '../../services/policyLimits/index.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js';

function getFeedbackDisabledReason(): string | undefined {
  if (isEnvTruthy(process.env.DISABLE_FEEDBACK_COMMAND) || isEnvTruthy(process.env.DISABLE_BUG_COMMAND)) {
    return 'Feedback is disabled by DISABLE_FEEDBACK_COMMAND or DISABLE_BUG_COMMAND env var';
  }
  if (isEssentialTrafficOnly()) {
    return 'Feedback is not available in essential traffic mode';
  }
  if (process.env.USER_TYPE === 'ant') {
    return 'Feedback is not available for Ant users';
  }
  if (!isPolicyAllowed('allow_product_feedback')) {
    return 'Feedback is not allowed by policy settings';
  }
  if (
    isEnvTruthy(process.env.CLEW_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLEW_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLEW_CODE_USE_FOUNDRY)
  ) {
    return 'Feedback is not available when using Bedrock, Vertex, or Foundry';
  }
  return undefined;
}

const feedback = {
  aliases: ['bug'],
  type: 'local-jsx',
  name: 'feedback',
  description: `Submit feedback about Clew Code`,
  argumentHint: '[report]',
  isEnabled: () => !getFeedbackDisabledReason(),
  disabledReason: () => getFeedbackDisabledReason(),
  load: () => import('./feedback.js'),
} satisfies Command;

export default feedback;
