import figures from 'figures';
import type * as React from 'react';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Box, Text } from '../ink.js';
import { formatDuration } from '../utils/format.js';

export type ResearchPhase =
  | 'planning'
  | 'collecting'
  | 'extracting'
  | 'synthesizing'
  | 'reporting'
  | 'completed'
  | 'failed';

export type CollectorProgress = {
  name: string; // 'local_repo' | 'local_wiki' | 'local_memory' | 'web'
  status: 'pending' | 'running' | 'completed' | 'failed';
  resultCount: number;
  durationMs: number;
};

export type ResearchProgressState = {
  query: string;
  mode: string;
  phase: ResearchPhase;
  phaseIndex: number; // 0-4
  totalPhases: number; // 5
  collectors: CollectorProgress[];
  sourceCount: number;
  claimCount: number;
  consensusCount: number;
  conflictCount: number;
  elapsedMs: number;
  error?: string;
};

export function useResearchProgress(state: ResearchProgressState) {
  const percentage = Math.min(100, Math.round((state.phaseIndex / state.totalPhases) * 100));
  const activeCollector = state.collectors.find(c => c.status === 'running')?.name;
  return {
    percentage,
    activeCollector,
    formattedDuration: formatDuration(state.elapsedMs),
  };
}

export function ResearchStatusLine({ state }: { state: ResearchProgressState }): React.ReactNode {
  const termWidth = useTerminalSize().columns;
  const { percentage, activeCollector, formattedDuration } = useResearchProgress(state);

  const statusGlyph = state.phase === 'completed' ? '✓' : state.phase === 'failed' ? '✗' : '◈';

  const detailStr =
    state.phase === 'collecting'
      ? `collecting ${state.sourceCount} sources${activeCollector ? ` via ${activeCollector}` : ''}`
      : state.phase === 'extracting'
        ? `extracting ${state.claimCount} claims`
        : state.phase;

  const line = `${statusGlyph} research [${detailStr}] ${percentage}% ${formattedDuration}`;
  const maxWidth = termWidth - 4;

  return (
    <Box paddingX={1}>
      <Text bold color={state.phase === 'failed' ? 'red' : 'cyan'}>
        {line.length > maxWidth ? `${line.slice(0, maxWidth)}…` : line}
      </Text>
    </Box>
  );
}

export function ResearchProgressPanel({ state }: { state: ResearchProgressState }): React.ReactNode {
  const termWidth = useTerminalSize().columns;
  const { percentage, formattedDuration } = useResearchProgress(state);

  const phases: { key: ResearchPhase; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'collecting', label: 'Collecting Sources' },
    { key: 'extracting', label: 'Extracting Claims' },
    { key: 'synthesizing', label: 'Synthesizing' },
    { key: 'reporting', label: 'Building Report' },
  ];

  // Helper to render phase line
  const renderPhaseLine = (p: { key: ResearchPhase; label: string }, idx: number) => {
    const isCompleted = state.phaseIndex > idx || state.phase === 'completed';
    const isRunning = state.phase === p.key;
    const isFailed = state.phase === 'failed' && state.phaseIndex === idx;

    let glyph = '○';
    let color = 'dim';
    if (isCompleted) {
      glyph = '✓';
      color = 'green';
    } else if (isFailed) {
      glyph = '✗';
      color = 'red';
    } else if (isRunning) {
      glyph = '◈';
      color = 'yellow';
    }

    return (
      <Box key={p.key} flexDirection="column">
        <Box>
          <Text color={color} bold={isRunning}>
            {glyph} {p.label}
          </Text>
        </Box>
        {p.key === 'collecting' && state.phaseIndex >= idx && (
          <Box flexDirection="column" paddingLeft={2}>
            {state.collectors.map(c => {
              let colGlyph = '·';
              let colColor = 'dim';
              if (c.status === 'completed') {
                colGlyph = '✓';
                colColor = 'green';
              } else if (c.status === 'failed') {
                colGlyph = '✗';
                colColor = 'red';
              } else if (c.status === 'running') {
                colGlyph = '⟐';
                colColor = 'cyan';
              }
              return (
                <Box key={c.name}>
                  <Text color={colColor}>
                    {colGlyph} {c.name.replace('local_', '')}
                  </Text>
                  <Text dimColor>
                    {c.status === 'running'
                      ? ' searching...'
                      : c.status === 'completed'
                        ? ` ${c.resultCount} sources (${(c.durationMs / 1000).toFixed(1)}s)`
                        : ` ${c.status}`}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    );
  };

  // Render progress bar
  const barWidth = Math.max(10, Math.min(40, termWidth - 25));
  const filledWidth = Math.round((percentage / 100) * barWidth);
  const unfilledWidth = barWidth - filledWidth;
  const bar = '▓'.repeat(filledWidth) + '░'.repeat(unfilledWidth);

  const boxWidth = Math.min(60, termWidth - 4);
  const borderLine = '─'.repeat(boxWidth);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Text bold color="cyan">
        ╭── Research Pipeline {borderLine.slice(22)}
      </Text>
      <Box paddingLeft={2}>
        <Text bold>Query: </Text>
        <Text>{state.query}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text bold>Mode: </Text>
        <Text>{state.mode}</Text>
      </Box>
      <Text color="cyan">├{borderLine.slice(2)}</Text>
      <Box flexDirection="column" paddingLeft={2}>
        {phases.map((p, i) => renderPhaseLine(p, i))}
      </Box>
      <Text color="cyan">├{borderLine.slice(2)}</Text>
      <Box paddingLeft={2} justifyContent="space-between" width={boxWidth}>
        <Text bold color="green">
          {bar} {percentage}%
        </Text>
        <Text dimColor>{formattedDuration}</Text>
      </Box>
      {state.error && (
        <Box paddingLeft={2} paddingTop={1}>
          <Text color="red" bold>
            Error: {state.error}
          </Text>
        </Box>
      )}
      <Text bold color="cyan">
        ╰──{borderLine.slice(3)}
      </Text>
    </Box>
  );
}
