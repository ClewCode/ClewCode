/** TasteSuggestTool — view auto-learn suggestions */

export const TASTE_SUGGEST_TOOL_NAME = 'taste_suggest';

export const DESCRIPTION =
  'View pending auto-learn suggestions that taste has detected from your coding patterns. ' +
  'Each suggestion has an ID, pattern text, confidence score, and can be accepted or rejected.';

export const PROMPT =
  'This tool shows suggestions that the taste auto-learn engine has detected. ' +
  'Each suggestion represents a pattern found in your accept/reject/edit signals. ' +
  'Suggestions have confidence scores — high confidence ones are auto-accepted. ' +
  'Use this to review what taste has learned from your behavior and accept/reject pending suggestions.';
