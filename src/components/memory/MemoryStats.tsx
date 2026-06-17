import { useEffect, useState } from 'react';
import { getOriginalCwd } from '../../bootstrap/state.js';
import { getContextStats } from '../../context/memoryStore.js';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { getExpertiseProfile } from '../../services/longTermMemory/experience.js';
import { getGraphStats } from '../../services/longTermMemory/graph.js';
import { computeDensity } from '../../services/longTermMemory/timeline.js';

interface Props {
  onClose: () => void;
}

export function MemoryStats({ onClose }: Props) {
  const [ctxStats, setCtxStats] = useState({ total: 0, byType: {} as Record<string, number> });
  const [graphStats, setGraphStats] = useState({ nodeCount: 0, edgeCount: 0, byType: {} as Record<string, number> });
  const [expertise, setExpertise] = useState<Array<{ topic: string; level: number; sessions: number }>>([]);
  const [density, setDensity] = useState<ReturnType<typeof computeDensity>>({
    total: 0,
    byDay: [],
    lastSession: null,
    firstSession: null,
    avgPerDay: 0,
  });

  useEffect(() => {
    const cwd = getOriginalCwd();
    setCtxStats(getContextStats());
    setGraphStats(getGraphStats(cwd));
    setExpertise(getExpertiseProfile(cwd));
    setDensity(computeDensity(cwd));
  }, []);

  useKeybinding('escape', onClose);

  const formatCount = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  // Activity sparkline (last 14 days)
  const sparkline = () => {
    const days = density.byDay.slice(0, 14).reverse();
    if (!days.length) return '(no data)';
    const max = Math.max(...days.map(d => d.count), 1);
    return days
      .map(d => {
        const h = Math.max(1, Math.round((d.count / max) * 4));
        return ['▁', '▂', '▃', '▄', '▅'][h - 1] || '▁';
      })
      .join('');
  };

  // XP bars for expertise
  const xpBar = (level: number): string => {
    const filled = '█'.repeat(Math.min(level, 10));
    const empty = '░'.repeat(Math.max(0, 10 - level));
    return `${filled}${empty}`;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Memory Dashboard</Text>
      </Box>

      {/* Overview */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Overview
        </Text>
        <Box>
          <Text>Context store: </Text>
          <Text color="green">{formatCount(ctxStats.total)}</Text>
          <Text dimColor> entries</Text>
        </Box>
        <Box>
          <Text>Knowledge graph: </Text>
          <Text color="cyan">{formatCount(graphStats.nodeCount)}</Text>
          <Text dimColor> nodes · </Text>
          <Text color="cyan">{formatCount(graphStats.edgeCount)}</Text>
          <Text dimColor> edges</Text>
        </Box>
        <Box>
          <Text>Sessions: </Text>
          <Text color="yellow">{density.total}</Text>
          <Text dimColor> total · </Text>
          <Text dimColor>{density.avgPerDay}/day</Text>
        </Box>
      </Box>

      {/* Activity */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Activity (14 days)
        </Text>
        <Text color="cyan">{sparkline()}</Text>
      </Box>

      {/* Expertise */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Expertise
        </Text>
        {expertise.length === 0 ? (
          <Text dimColor>No expertise data yet.</Text>
        ) : (
          expertise.slice(0, 6).map(e => (
            <Box key={e.topic}>
              <Text>{xpBar(e.level)}</Text>
              <Text> {e.topic}</Text>
              <Text dimColor>
                {' '}
                Lv.{e.level} · {e.sessions} sessions
              </Text>
            </Box>
          ))
        )}
      </Box>

      {/* Context breakdown */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Context by Type
        </Text>
        {Object.entries(ctxStats.byType).length === 0 ? (
          <Text dimColor>No contexts yet.</Text>
        ) : (
          Object.entries(ctxStats.byType).map(([type, count]) => (
            <Box key={type}>
              <Text> {type}: </Text>
              <Text color="green">{count}</Text>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>esc close</Text>
      </Box>
    </Box>
  );
}
