/**
 * Shining Policy — bounded execution
 * 0.00-0.49 ignore
 * 0.50-0.69 prefetch cheap context only
 * 0.70-0.89 surface suggestion / prepare context
 * 0.90+ prepare proposed action (still needs approval)
 */

export type PolicyAction = 'ignore' | 'prefetch' | 'suggest' | 'prepare';

export function policyFor(confidence: number): PolicyAction {
  if (confidence < 0.5) return 'ignore';
  if (confidence < 0.7) return 'prefetch';
  if (confidence < 0.9) return 'suggest';
  return 'prepare';
}

export const POLICY_DESCRIPTIONS: Record<PolicyAction, string> = {
  ignore: 'ignore',
  prefetch: 'prefetch cheap context only',
  suggest: 'surface suggestion / prepare context',
  prepare: 'prepare proposed action (needs approval)',
};
