/**
 * AgentViewDispatchInput — Input area for dispatching new agents and filtering.
 * Supports: plain text prompts, @<agent>, @<repo>, /<skill>, #<PR>, a:<name>, s:<state>
 */

import * as React from 'react';
import { Box, Text } from '../../ink.js';
import TextInput from '../TextInput.js';

type DispatchMode = 'dispatch' | 'filter';

type Props = {
  mode: DispatchMode;
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  cursorOffset: number;
  onCursorOffsetChange: (offset: number) => void;
  placeholder?: string;
  filterSyntax?: string;
};

/**
 * Parse dispatch/filter input for special syntax:
 * - @<agent> — dispatch with specific subagent
 * - @<repo> — dispatch in a sibling repo
 * - /<skill> — dispatch a skill
 * - #<PR> — find session for PR
 * - a:<name> — filter by agent name
 * - s:<state> — filter by state
 */
export function parseDispatchSyntax(input: string): {
  agentName?: string;
  repoName?: string;
  skillName?: string;
  prNumber?: number;
  filterAgent?: string;
  filterState?: string;
  cleanPrompt: string;
  isFilter: boolean;
  isPRLookup: boolean;
} {
  const trimmed = input.trim();

  // Filter syntax (a:<name> or s:<state>)
  const filterAgentMatch = trimmed.match(/^a:(\S+)/);
  const filterStateMatch = trimmed.match(/^s:(\S+)/);
  if (filterAgentMatch || filterStateMatch) {
    return {
      filterAgent: filterAgentMatch?.[1],
      filterState: filterStateMatch?.[1],
      cleanPrompt: '',
      isFilter: true,
      isPRLookup: false,
    };
  }

  // PR lookup (#<number> or PR URL)
  const prMatch = trimmed.match(/^#(\d+)/);
  const prUrlMatch = trimmed.match(/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  if (prMatch) {
    return {
      prNumber: parseInt(prMatch[1]!, 10),
      cleanPrompt: '',
      isFilter: true,
      isPRLookup: true,
    };
  }
  if (prUrlMatch) {
    return {
      prNumber: parseInt(prUrlMatch[1]!, 10),
      cleanPrompt: '',
      isFilter: true,
      isPRLookup: true,
    };
  }

  // @agent or @repo mentions
  const agentMatch = trimmed.match(/^@(\S+)/);
  let agentName: string | undefined;
  let _repoName: string | undefined;
  if (agentMatch) {
    const name = agentMatch[1]!;
    // Remove @mention from prompt
    const remaining = trimmed.replace(/^@\S+\s*/, '');
    // Assume it's an agent first (caller resolves priority)
    agentName = name;
    return {
      agentName,
      cleanPrompt: remaining || trimmed,
      isFilter: false,
      isPRLookup: false,
    };
  }

  // /skill mention
  const skillMatch = trimmed.match(/^\/(\S+)/);
  if (skillMatch) {
    return {
      skillName: skillMatch[1]!,
      cleanPrompt: trimmed,
      isFilter: false,
      isPRLookup: false,
    };
  }

  return {
    cleanPrompt: trimmed,
    isFilter: false,
    isPRLookup: false,
  };
}

export function AgentViewDispatchInput({
  mode,
  value,
  onChange,
  onSubmit,
  cursorOffset,
  onCursorOffsetChange,
  placeholder,
  filterSyntax,
}: Props) {
  const parsed = React.useMemo(() => parseDispatchSyntax(value), [value]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color={mode === 'dispatch' ? 'suggestion' : 'dim'}>{mode === 'dispatch' ? '>' : '/'}</Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          columns={80}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={onCursorOffsetChange}
        />
      </Box>

      {/* Syntax indicators */}
      {value.trim() && (
        <Box flexDirection="row" gap={2} marginTop={0}>
          {parsed.agentName && <Text dimColor>Agent: {parsed.agentName}</Text>}
          {parsed.filterAgent && <Text dimColor>Filter by agent: {parsed.filterAgent}</Text>}
          {parsed.filterState && <Text dimColor>Filter by state: {parsed.filterState}</Text>}
          {parsed.prNumber && <Text dimColor>Looking up PR #{parsed.prNumber}</Text>}
          {parsed.skillName && <Text dimColor>Skill: {parsed.skillName}</Text>}
        </Box>
      )}

      {/* Hint text */}
      {filterSyntax && (
        <Box marginTop={0}>
          <Text dimColor>{filterSyntax}</Text>
        </Box>
      )}
    </Box>
  );
}
