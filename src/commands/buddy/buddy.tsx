import * as React from 'react';
import { Box, Text, useInput } from '../../ink.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { getCompanion } from '../../buddy/companion.js';
import { renderSprite } from '../../buddy/sprites.js';
import { RARITY_COLORS, RARITY_STARS } from '../../buddy/types.js';

interface BuddyProps {
  onDone: (result?: string, options?: { display?: 'system' | 'user' | 'skip' }) => void;
  setAppState: LocalJSXCommandContext['setAppState'];
}

function pokemonBar(value: number, max = 15): string {
  const fill = Math.round((value / 100) * max);
  return '█'.repeat(fill) + '░'.repeat(max - fill);
}

function BuddyCard({ setAppState, onDone }: BuddyProps): React.ReactNode {
  const companion = getCompanion();

  useInput((input, key) => {
    if (key.escape || input === 'q' || key.return || input === ' ') {
      onDone(undefined, { display: 'skip' });
    }
  });

  if (!companion) {
    return (
      <Box width={40} flexDirection="column" padding={1} borderStyle="round" borderColor="subtle">
        <Text bold>Buddy</Text>
        <Text dimColor>No buddy yet. Use /buddy show to create one.</Text>
        <Box marginTop={1}><Text dimColor>any key to close</Text></Box>
      </Box>
    );
  }

  const color = (RARITY_COLORS[companion.rarity] as string) ?? 'inactive';
  const stars = RARITY_STARS[companion.rarity];
  const sprite = renderSprite(companion);
  const hp = companion.stats.DEBUGGING ?? 50;

  // ── Top 2 stats become "moves" ──────────────────────
  type SE = [string, number];
  const entries = Object.entries(companion.stats) as SE[];
  const tops = [...entries].sort(([, a], [, b]) => b - a).slice(0, 2);
  const MOVE_NAMES: Record<string, string> = {
    DEBUGGING: 'Debug Beam',
    PATIENCE: 'Patience Rest',
    CHAOS: 'Chaos Blast',
    WISDOM: 'Wisdom Aura',
    SNARK: 'Snark Slap',
  };

  const flavor = companion.personality
    ? companion.personality.slice(0, 36)
    : `${companion.name} is ready to code!`;

  return (
    <Box width={44} flexDirection="column" borderStyle="bold" borderColor={color} paddingX={1} paddingY={0}>

      {/* ═══ Top bar: Name + HP ═══ */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>{companion.name}</Text>
        <Box flexDirection="row" gap={1}>
          <Text color={color}>{stars}</Text>
          <Text dimColor>HP</Text>
          <Text bold color={hp > 50 ? 'success' : 'warning'}>{hp}</Text>
        </Box>
      </Box>

      {/* ── Type bar ── */}
      <Box flexDirection="row">
        <Text dimColor>{companion.species.toUpperCase()} · {companion.rarity.toUpperCase()}</Text>
      </Box>

      {/* ═══════ Sprite ═══════ */}
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {sprite.map((line, i) => (
          <Text key={i} color={color}>{line}</Text>
        ))}
      </Box>
      <Box flexDirection="row" justifyContent="center">
        <Text dimColor italic>"{flavor}"</Text>
      </Box>

      {/* ═══════ Moves ═══════ */}
      <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="subtle" paddingX={1}>
        {tops.map(([stat, val]) => {
          const name = MOVE_NAMES[stat] ?? stat;
          return (
            <Box key={stat} flexDirection="row" gap={1}>
              <Text dimColor color={color}>{name.padEnd(14)}</Text>
              <Text>{pokemonBar(val, 12)}</Text>
              <Text dimColor>{String(val).padStart(3)}</Text>
            </Box>
          );
        })}
      </Box>

      {/* ═══════ Stats ═══════ */}
      <Box marginTop={1} flexDirection="column">
        {entries.map(([k, v]) => (
          <Box key={k} flexDirection="row" gap={1}>
            <Text dimColor>{k.padEnd(10)}</Text>
            <Text>{pokemonBar(v, 10)}</Text>
            <Text dimColor>{String(v).padStart(3)}</Text>
          </Box>
        ))}
      </Box>

      {/* ═══ Footer ═══ */}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text dimColor>
          {companion.shiny ? '✦ SHINY ' : ''}
          {companion.eye}{companion.hat === 'none' ? '' : `·${companion.hat}`}
        </Text>
      </Box>
      <Box>
        <Text dimColor>/buddy · any key to close</Text>
      </Box>
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const { setAppState } = _context;
  const cmd = args.toLowerCase().trim();
  const parts = args.trim().split(' ');

  if (cmd === 'show' || cmd === 'on') {
    saveGlobalConfig(current => ({
      ...current,
      companion: current.companion
        ? { ...current.companion, visible: true }
        : { name: 'duck', personality: 'duck companion', hatchedAt: Date.now(), visible: true, animation: 'idle' },
    }));
    setAppState(prev => ({ ...prev, companionVisible: true }));
    onDone('Buddy is now visible!');
    return null;
  }

  if (cmd === 'hide' || cmd === 'off') {
    saveGlobalConfig(current => ({
      ...current,
      companion: current.companion
        ? { ...current.companion, visible: false }
        : { name: 'duck', personality: 'duck companion', hatchedAt: Date.now(), visible: false, animation: 'idle' },
    }));
    setAppState(prev => ({ ...prev, companionVisible: false }));
    onDone('Buddy is now hidden!');
    return null;
  }

  if (cmd === 'name' || cmd === 'rename') {
    const name = parts.slice(1).join(' ').trim();
    if (!name) {
      onDone('Usage: /buddy name <newname>', { display: 'system' });
      return null;
    }
    saveGlobalConfig(current => ({
      ...current,
      companion: current.companion
        ? { ...current.companion, name }
        : { name, personality: 'duck companion', hatchedAt: Date.now(), visible: true, animation: 'idle' },
    }));
    onDone(`Buddy renamed to ${name}!`);
    return null;
  }

  return React.createElement(BuddyCard, { onDone, setAppState });
};
