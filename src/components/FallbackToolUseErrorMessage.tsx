import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import type * as React from 'react';
import { stripUnderlineAnsi } from 'src/components/shell/OutputLine.js';
import { extractTag } from 'src/utils/messages.js';
import { removeSandboxViolationTags } from 'src/utils/sandbox/sandbox-ui-utils.js';
import { Box, Text } from '../ink.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import { countCharInString } from '../utils/stringUtils.js';
import { MessageResponse } from './MessageResponse.js';

const MAX_RENDERED_LINES = 10;

/**
 * Turn a Zod InputValidationError payload into a concise one-line summary
 * naming the offending field(s). Zod's error.message is a JSON array of issue
 * objects ({ message, path, ... }). Returns "Invalid tool parameters: <field>:
 * <message>" for the first issue, or the generic label if anything is off.
 */
export function summarizeValidationError(trimmed: string): string {
  const generic = 'Invalid tool parameters';
  const jsonStart = trimmed.indexOf('[', trimmed.indexOf('InputValidationError: '));
  if (jsonStart === -1) {
    const detail = trimmed
      .slice(trimmed.indexOf('InputValidationError: ') + 'InputValidationError: '.length)
      .split('\n')
      .map(line => line.trim())
      .find(line => /parameter|expected|invalid|unrecognized/i.test(line));
    return detail ? `${generic}: ${detail}` : generic;
  }
  try {
    const issues = JSON.parse(trimmed.slice(jsonStart));
    if (!Array.isArray(issues) || issues.length === 0) return generic;
    const first = issues[0];
    const message = typeof first?.message === 'string' ? first.message : '';
    const field = Array.isArray(first?.path) && first.path.length > 0 ? first.path.join('.') : '';
    const detail = field && message ? `${field}: ${message}` : field || message;
    if (!detail) return generic;
    const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : '';
    return `${generic}: ${detail}${more}`;
  } catch {
    return generic;
  }
}

type Props = {
  result: ToolResultBlockParam['content'];
  verbose: boolean;
};

export function FallbackToolUseErrorMessage({ result, verbose }: Props): React.ReactNode {
  const transcriptShortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o');
  let error: string;

  if (typeof result !== 'string') {
    error = 'Tool execution failed';
  } else {
    const extractedError = extractTag(result, 'tool_use_error') ?? result;
    // Remove sandbox_violations tags from error display (Claude still sees them in the tool result)
    const withoutSandboxViolations = removeSandboxViolationTags(extractedError);
    // Strip <error> tags but keep their content (tags are for the model, not the UI)
    const withoutErrorTags = withoutSandboxViolations.replace(/<\/?error>/g, '');
    const trimmed = withoutErrorTags.trim();
    if (!verbose && trimmed.includes('InputValidationError: ')) {
      // Zod serializes error.message as a JSON array of issues. Surface the
      // first issue's field + message (e.g. "old_string: Required") so the
      // user can see WHICH parameter is wrong instead of a bare
      // "Invalid tool parameters". Fall back to the generic label if the
      // payload isn't the expected shape.
      error = summarizeValidationError(trimmed);
    } else if (trimmed.startsWith('Error: ') || trimmed.startsWith('Cancelled: ')) {
      error = trimmed;
    } else {
      error = `Error: ${trimmed}`;
    }
  }

  const plusLines = countCharInString(error, '\n') + 1 - MAX_RENDERED_LINES;

  return (
    <MessageResponse>
      <Box flexDirection="column">
        <Text color="error">
          {stripUnderlineAnsi(verbose ? error : error.split('\n').slice(0, MAX_RENDERED_LINES).join('\n'))}
        </Text>
        {!verbose && plusLines > 0 && (
          // The careful <Text> layout is a workaround for the dim-bold
          // rendering bug
          <Box>
            <Text dimColor>
              … +{plusLines} {plusLines === 1 ? 'line' : 'lines'} (
            </Text>
            <Text dimColor bold>
              {transcriptShortcut}
            </Text>
            <Text> </Text>
            <Text dimColor>to see all)</Text>
          </Box>
        )}
      </Box>
    </MessageResponse>
  );
}
