/** MemoryFeedbackTool — let AI apply feedback signals to memories */

export const MEMORY_FEEDBACK_TOOL_NAME = 'memory_feedback';

export const DESCRIPTION =
  'Apply feedback to a memory entry. Signals: accepted (confirm correct), ' +
  'rejected (mark incorrect), corrected (mark edited), preferred (save to TASTE.md), ' +
  'disliked (negative signal), important (boost importance), wrong (factually wrong). ' +
  'Updates importance/confidence and records events in timeline.';

export const PROMPT =
  'This tool lets you give feedback on memories. Use it to confirm correct memories, ' +
  'reject incorrect ones, mark important knowledge, or save coding preferences. ' +
  'The `preferred` signal writes your note into TASTE.md for cross-session persistence.';
