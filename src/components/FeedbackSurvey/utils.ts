/**
 * Shared types for the in-REPL feedback surveys.
 */

/**
 * A user's answer to a feedback survey. The numeric keys the dialog accepts
 * map onto these in `FeedbackSurveyView.tsx` (0 → dismissed, 1 → bad,
 * 2 → fine, 3 → good).
 */
export type FeedbackSurveyResponse = 'dismissed' | 'bad' | 'fine' | 'good';

/**
 * Which survey is being shown. Reported as the `survey_type` analytics
 * dimension by `useFeedbackSurvey`, `useMemorySurvey` and
 * `usePostCompactSurvey`.
 */
export type FeedbackSurveyType = 'session' | 'memory' | 'post_compact';
