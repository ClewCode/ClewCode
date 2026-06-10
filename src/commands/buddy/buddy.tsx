import * as React from 'react';
import { getCompanion } from '../../buddy/companion.js';
import { renderSprite } from '../../buddy/sprites.js';
import { RARITY_COLORS, RARITY_STARS } from '../../buddy/types.js';
import { Box, Text, useInput } from '../../ink.js';
import type { LocalJSXCommandCall, LocalJSXCommandContext } from '../../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';

interface BuddyProps {
  onDone: (result?: string, options?: { display?: 'system' | 'user' | 'skip' }) => void;
  setAppState: LocalJSXCommandContext['setAppState'];
}

const CARD_W = 44;
const INNER_W = CARD_W - 4; // minus border(2) + padding(2)
const BAR_FULL = 10;

function statBar(value: number): string {
  const fill = Math.round((value / 100) * BAR_FULL);
  return '█'.repeat(fill) + '░'.repeat(BAR_FULL - fill);
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
      <Box width={CARD_W} flexDirection="column" padding={1} borderStyle="round" borderColor="subtle">
        <Text bold>Buddy</Text>
        <Text dimColor>No buddy yet. Use /buddy show to create one.</Text>
        <Box marginTop={1}>
          <Text dimColor>any key to close</Text>
        </Box>
      </Box>
    );
  }

  const color = RARITY_COLORS[companion.rarity] as string;
  const stars = RARITY_STARS[companion.rarity];
  const sprite = renderSprite(companion);

  // ── Header line: rarity + species ─────────────────────
  const headerR = `${stars} ${companion.rarity.toUpperCase()}`;
  const headerL = companion.species.toUpperCase();

  // ── Stat lines ─────────────────────────────────────────
  const maxNameLen = Math.max(...Object.keys(companion.stats).map(k => k.length));
  const statLines = (Object.entries(companion.stats) as Array<[string, number]>).map(([k, v]) => {
    const padded = k.padEnd(maxNameLen);
    return `${padded} ${statBar(v)} ${String(v).padStart(3)}`;
  });

  return (
    <Box width={CARD_W} flexDirection="column" borderStyle="round" borderColor={color} padding={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={color}>
          {headerR}
        </Text>
        <Text bold>{headerL}</Text>
      </Box>

      {/* Sprite */}
      <Box flexDirection="column" alignItems="center" marginTop={1}>
        {sprite.map((line, i) => (
          <Text key={i} color={color}>
            {line}
          </Text>
        ))}
      </Box>

      {/* Name */}
      <Box flexDirection="row" justifyContent="center">
        <Text bold color={color}>
          {companion.name}
        </Text>
      </Box>

      {/* Personality */}
      {companion.personality ? (
        <Box flexDirection="row" justifyContent="center" paddingX={1}>
          <Text dimColor italic wrap="truncate-end">
            "{companion.personality}"
          </Text>
        </Box>
      ) : null}

      {/* Stats */}
      <Box flexDirection="column" marginTop={1}>
        {statLines.map((line, i) => (
          <Text key={i} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>{companion.name} is here · it'll chime in as you code</Text>
      </Box>
      <Box>
        <Text dimColor>your buddy won't count toward your usage</Text>
      </Box>
      <Box>
        <Text dimColor>say its name to get its take · /buddy off</Text>
      </Box>

      <Box marginTop={0}>
        <Text dimColor>any key</Text>
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
