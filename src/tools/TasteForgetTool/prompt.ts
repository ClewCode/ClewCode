/** TasteForgetTool — remove a taste rule */

export const TASTE_FORGET_TOOL_NAME = 'taste_forget';

export const DESCRIPTION =
  'Remove a rule from the taste preference system by its ID. ' +
  'Use taste_profile first to find the rule ID to remove.';

export const PROMPT =
  'This tool removes a rule from the taste preference system. ' +
  'Use taste_profile first to list all rules and find the ID of the rule to remove. ' +
  '`ruleId` is the exact ID string from the taste_profile output.';
