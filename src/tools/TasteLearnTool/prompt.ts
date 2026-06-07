/** TasteLearnTool — teach taste a new rule */

export const TASTE_LEARN_TOOL_NAME = 'taste_learn';

export const DESCRIPTION =
  'Teach the taste preference system a new rule. ' +
  'The rule is stored and injected into future system prompts to guide behavior. ' +
  'Use this to add explicit coding preferences, style rules, or conventions.';

export const PROMPT =
  'This tool adds a new rule to the taste preference-learning system. ' +
  'The rule will be injected into future system prompts via <clew_taste> block. ' +
  '`text` is the rule description (e.g. "Use const instead of let when possible"). ' +
  '`kind` categorizes the rule: style, architecture, tooling, testing, naming, security, performance, ui, or workflow. ' +
  '`tags` are optional keywords for semantic matching (e.g. ["typescript", "variables"]).';
