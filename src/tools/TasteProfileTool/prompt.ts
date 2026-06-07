/** TasteProfileTool — read taste rules */

export const TASTE_PROFILE_TOOL_NAME = 'taste_profile';

export const DESCRIPTION =
  'Show all currently active taste preference rules. ' +
  'Includes rule ID, kind, text, confidence, and source. ' +
  'Use this to see what preferences are being applied to your coding style.';

export const PROMPT =
  'This tool reads all active taste rules from the preference-learning system. ' +
  'It returns rule IDs, kinds, text descriptions, confidence scores, and sources. ' +
  'Use this to understand what taste preferences are guiding your responses. ' +
  'Use taste_learn and taste_forget to add or remove rules.';
