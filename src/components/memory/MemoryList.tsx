import { useState, useEffect } from 'react';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import { searchContext, listContexts, getContextStats } from '../../context/memoryStore.js';

interface Props {
  onSelect?: (key: string) => void;
  onClose: () => void;
  initialQuery?: string;
}

export function MemoryList({ onSelect, onClose, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery || '');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [stats, setStats] = useState({ total: 0, byType: {} as Record<string, number> });

  useEffect(() => {
    const s = getContextStats();
    setStats(s);
  }, []);

  useEffect(() => {
    if (query.trim()) {
      const results = searchContext(query, 20);
      setEntries(results.map(r => ({
        key: r.key,
        value: r.value,
        type: r.type,
        tags: JSON.parse(r.tags || '[]'),
        confidence: r.confidence,
        updatedAt: r.updated_at,
        accessCount: r.access_count,
      })));
    } else {
      const all = listContexts();
      setEntries(all.map(r => ({
        key: r.key,
        value: r.value,
        type: r.type,
        tags: JSON.parse(r.tags || '[]'),
        confidence: r.confidence,
        updatedAt: r.updated_at,
        accessCount: r.access_count,
      })));
    }
    setSelected(0);
  }, [query]);

  useKeybinding('up', () => setSelected(Math.max(0, selected - 1)));
  useKeybinding('down', () => setSelected(Math.min(entries.length - 1, selected + 1)));

  useKeybinding('enter', () => {
    if (entries[selected] && onSelect) {
      onSelect(entries[selected].key);
    }
  });

  useKeybinding('escape', onClose);

  const typeColor = (type: string) => {
    switch (type) {
      case 'edit': return 'yellow';
      case 'command': return 'cyan';
      case 'note': return 'green';
      default: return 'white';
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Memory Store</Text>
        <Text dimColor>  ({stats.total} entries · {Object.keys(stats.byType).length} types)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>{query ? `Search: ${query}` : 'All entries (type to filter)'}</Text>
      </Box>

      <Box flexDirection="column" minHeight={10}>
        {entries.length === 0 ? (
          <Box>
            <Text dimColor>No memories yet. Edit files or run commands to build context.</Text>
          </Box>
        ) : (
          entries.slice(0, 15).map((entry, i) => (
            <Box key={entry.key} flexDirection="column">
              <Box>
                <Text color={i === selected ? 'cyan' : 'white'}>
                  {i === selected ? '▸ ' : '  '}
                </Text>
                <Text color={typeColor(entry.type)} wrap="truncate" bold={i === selected}>
                  {entry.key.slice(0, 50)}
                </Text>
                <Text dimColor>  · {entry.type}</Text>
                <Text dimColor>  · c:{Math.round(entry.confidence * 100)}%</Text>
              </Box>
              <Box marginLeft={3}>
                <Text dimColor wrap="truncate" italic>
                  {entry.value.slice(0, 120)}
                </Text>
              </Box>
            </Box>
          ))
        )}
      </Box>

      {entries.length > 15 && (
        <Box marginTop={1}>
          <Text dimColor>...and {entries.length - 15} more</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · enter select · esc close</Text>
      </Box>
    </Box>
  );
}

interface MemoryEntry {
  key: string;
  value: string;
  type: string;
  tags: string[];
  confidence: number;
  updatedAt: number;
  accessCount: number;
}
