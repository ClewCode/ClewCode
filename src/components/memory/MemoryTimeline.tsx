import { useEffect, useState } from 'react';
import { getOriginalCwd } from '../../bootstrap/state.js';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { getDigests, getSessionHistory } from '../../services/longTermMemory/crossSession.js';

interface Props {
  onClose: () => void;
}

interface DisplayRow {
  type: 'session' | 'digest';
  date: string;
  label: string;
  detail: string;
}

export function MemoryTimeline({ onClose }: Props) {
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const cwd = getOriginalCwd();
    const sessions = getSessionHistory(cwd, 20);
    const digests = getDigests(cwd);

    const items: DisplayRow[] = [];

    for (const d of digests) {
      const pats: string[] = JSON.parse(d.patterns || '[]');
      items.push({
        type: 'digest',
        date: `${d.type} ${d.period}`,
        label: `📊 ${d.type} · ${d.session_count} sessions`,
        detail: pats.length ? `Patterns: ${pats.join(', ')}` : d.summary?.slice(0, 200) || '',
      });
    }

    for (const s of sessions) {
      const d = new Date(s.end_time);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const consLabel = s.consolidated === 0 ? '' : s.consolidated === 1 ? ' [weekly]' : ' [monthly]';
      items.push({
        type: 'session',
        date: dateStr,
        label: `${s.model || '?'}${consLabel}`,
        detail: s.summary?.slice(0, 300) || '',
      });
    }

    items.sort((a, b) => b.date.localeCompare(a.date) || b.label.localeCompare(a.label));
    setRows(items.slice(0, 30));
  }, []);

  useKeybinding('escape', onClose);

  const _toggleExpand = (idx: number) => {
    setExpanded(expanded === idx ? null : idx);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Memory Timeline</Text>
        <Text dimColor> ({rows.length} entries)</Text>
      </Box>

      <Box flexDirection="column" minHeight={10}>
        {rows.length === 0 ? (
          <Text dimColor>No session history yet.</Text>
        ) : (
          rows.map((row, i) => (
            <Box key={`${row.date}-${i}`} flexDirection="column">
              <Box>
                <Text color={row.type === 'digest' ? 'magenta' : 'cyan'}>{row.type === 'digest' ? '◆' : '·'}</Text>
                <Text dimColor> {row.date}</Text>
                <Text> {row.label}</Text>
              </Box>
              {expanded === i && row.detail && (
                <Box marginLeft={3} marginTop={1} marginBottom={1}>
                  <Text dimColor wrap="wrap">
                    {row.detail}
                  </Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ scroll · enter expand · esc close</Text>
      </Box>
    </Box>
  );
}
