import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../../ink.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import {
  lintTaste,
  pushTaste,
  readAllTaste,
  removeTaste,
  TASTE_CATEGORIES,
  type TasteCategory,
  type TasteEntry,
  type TasteScope,
} from '../../services/taste/store.js';
import { isTasteEnabled, TASTE_APPLY_THRESHOLD } from '../../services/taste/taste.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getInitialSettings, updateSettingsForSource } from '../../utils/settings/settings.js';

// Placeholders are spelled without angle brackets: the transcript renderer
// treats `<n>` as markup and silently eats it, which left the usage line
// reading "forget  remove entry number  from the list".
const USAGE: readonly [string, string][] = [
  ['/taste', 'list learned preferences'],
  ['/taste on', 'resume learning and applying'],
  ['/taste off', 'stop both'],
  ['/taste forget 2', 'remove entry 2 from the list'],
  ['/taste push [cat]', 'copy project→global preferences'],
  ['/taste pull [cat]', 'copy global→project preferences'],
  ['/taste lint', 'validate preference files'],
];

function TasteBadge(): React.ReactNode {
  return (
    <Text color="remember" inverse bold>
      {' TASTE '}
    </Text>
  );
}

function TasteView({ entries, status }: { entries: TasteEntry[]; status: string }): React.ReactNode {
  const applied = entries.filter(e => e.confidence >= TASTE_APPLY_THRESHOLD).length;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <TasteBadge />
        <Text> </Text>
        <Text color="suggestion">{status}</Text>
        {entries.length > 0 && (
          <Text dimColor>
            {' '}
            · {applied} of {entries.length} applied
          </Text>
        )}
      </Box>

      {entries.length === 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor wrap="wrap">
            Nothing learned yet. Preferences get picked up from how you work — the language and length you want replies
            in, the shape of the output, how much to ask before deciding.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {entries.map((entry, i) => (
            <TasteRow key={entry.id} entry={entry} index={i + 1} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        {USAGE.map(([command, description]) => (
          <Box key={command} flexDirection="row">
            <Box width={18}>
              <Text color="suggestion">{command}</Text>
            </Box>
            <Text dimColor>{description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to close</Text>
      </Box>
    </Box>
  );
}

function TasteRow({ entry, index }: { entry: TasteEntry; index: number }): React.ReactNode {
  const isApplied = entry.confidence >= TASTE_APPLY_THRESHOLD;
  const showCategory = entry.category !== 'general';
  return (
    <Box flexDirection="row">
      <Box width={4}>
        <Text dimColor>{index}.</Text>
      </Box>
      <Box width={10}>
        <Text dimColor>[{entry.scope}]</Text>
      </Box>
      {showCategory && (
        <Box marginRight={1}>
          <Text color="suggestion">[{entry.category}]</Text>
        </Box>
      )}
      <Box flexShrink={1}>
        <Text dimColor={!isApplied} wrap="wrap">
          {entry.text}
          <Text dimColor> — {Math.round(entry.confidence * 100)}%</Text>
          {!isApplied && <Text dimColor> (recorded, not applied)</Text>}
        </Text>
      </Box>
    </Box>
  );
}

/** Subcommands are resolved in `call` before this mounts, so it only lists. */
function TasteCommand({ onClose }: { onClose: () => void }): React.ReactNode {
  // Close only the TASTE overlay. Consuming the interrupt here prevents the
  // global handler from cancelling the active agent turn.
  useKeybinding('app:interrupt', onClose, { context: 'Global' });

  const [entries, setEntries] = useState<TasteEntry[] | null>(null);

  useEffect(() => {
    void readAllTaste().then(setEntries);
  }, []);

  if (entries === null) {
    return <Text dimColor>Reading TASTE.md…</Text>;
  }
  return <TasteView entries={entries} status={statusLabel()} />;
}

function statusLabel(): string {
  if (isTasteEnabled()) return 'on';
  return getInitialSettings().tasteEnabled === false ? 'off' : 'off (auto-memory is disabled)';
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const [subcommand = '', ...rest] = (args ?? '').trim().split(/\s+/).filter(Boolean);

  switch (subcommand.toLowerCase()) {
    case '':
      return <TasteCommand onClose={() => onDone(undefined, { display: 'skip' })} />;

    case 'on':
    case 'off': {
      const enabled = subcommand.toLowerCase() === 'on';
      updateSettingsForSource('userSettings', { tasteEnabled: enabled });
      if (enabled && !isTasteEnabled()) {
        // The setting write stands, but taste rides on the extraction fork —
        // say why nothing will happen rather than reporting success.
        onDone(
          'Taste enabled in settings, but auto-memory is off — taste rides on memory extraction, so it stays inactive until auto-memory is on.',
        );
        return null;
      }
      onDone(`Taste ${enabled ? 'on' : 'off'}.`);
      return null;
    }

    case 'forget': {
      const index = Number(rest[0]);
      if (!Number.isInteger(index) || index < 1) {
        onDone('Give the entry number to forget, e.g. "/taste forget 2".');
        return null;
      }
      const all = await readAllTaste();
      const entry = all[index - 1];
      if (!entry) {
        onDone(`No entry ${index}. There ${all.length === 1 ? 'is' : 'are'} ${all.length}.`);
        return null;
      }
      const removed = await removeTaste(entry.scope, entry.text, entry.category);
      onDone(removed ? `Forgot: ${entry.text}` : 'Could not remove that entry.');
      return null;
    }

    case 'push':
    case 'pull': {
      const direction = subcommand.toLowerCase();
      const source: TasteScope = direction === 'push' ? 'project' : 'global';
      const target: TasteScope = direction === 'push' ? 'global' : 'project';
      const catArg = rest[0]?.toLowerCase();
      const category =
        catArg && TASTE_CATEGORIES.includes(catArg as TasteCategory) ? (catArg as TasteCategory) : undefined;
      const copied = await pushTaste(source, target, category);
      if (copied.length === 0) {
        onDone(`Nothing to ${direction} — ${source} ${category ? `[${category}] ` : ''}already matches ${target}.`);
        return null;
      }
      onDone(
        `${direction === 'push' ? 'Pushed' : 'Pulled'} ${copied.length} ${
          copied.length === 1 ? 'preference' : 'preferences'
        } from ${source} to ${target}${category ? ` [${category}]` : ''}.`,
      );
      return null;
    }

    case 'lint': {
      const results = await lintTaste();
      const total = results.global.length + results.project.length;
      if (total === 0) {
        onDone('Taste files are clean.');
        return null;
      }
      const details = ['global', 'project']
        .filter(s => results[s as TasteScope].length > 0)
        .map(s => {
          const errors = results[s as TasteScope];
          return `${s}: ${errors.map(e => `line ${e.line} — ${e.message}`).join(', ')}`;
        })
        .join('; ');
      onDone(`Found ${total} ${total === 1 ? 'issue' : 'issues'} in taste files.\n${details}`);
      return null;
    }

    default:
      onDone(
        `Unknown subcommand "${subcommand}". Try /taste, /taste on, /taste off, /taste forget 2, /taste push [cat], /taste pull [cat], or /taste lint.`,
      );
      return null;
  }
};
