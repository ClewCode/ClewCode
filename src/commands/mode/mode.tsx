import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from '../../ink.js';
import { clearModeDirCache } from '../../modes/loadModesDir.js';
import { getActiveModeName, listModes, MODE_OFF, type ModeConfig, setActiveMode } from '../../modes/modes.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

const HELP_ARGS = new Set(['help', '-h', '--help']);

const HELP_TEXT = `Usage: /mode [name|off|list]

A mode layers instructions onto the system prompt that change how Clew works a
task — its approach and tone — without changing what it can do.

  /mode              pick from a list
  /mode reviewer     switch to a mode
  /mode off          clear the active mode
  /mode list         show every available mode and where it came from

Define your own by dropping a markdown file in .clew/modes/ (project) or
~/.clew/modes/ (user). The filename is the mode name; the body is the prompt:

  ---
  name: gamemaster
  description: Runs a tabletop scene and tracks state
  ---
  You narrate a scene ...

A project mode overrides a user mode of the same name, which overrides a
built-in. Modes persist across sessions; CLEW_CODE_MODE overrides the saved
value for one session.`;

function sourceLabel(source: ModeConfig['source']): string {
  return source === 'built-in' ? '' : ` (${source})`;
}

/** Applies a mode, then closes with a one-line confirmation. */
function ApplyModeAndClose({
  name,
  onDone,
}: {
  name: string | undefined;
  onDone: LocalJSXCommandOnDone;
}): React.ReactNode {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (name === undefined) {
        const { error } = setActiveMode(undefined);
        if (!cancelled) {
          logEvent('tengu_mode_command', { mode: 'off' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS });
          onDone(error ? `Cleared mode for this session, but saving failed: ${error}` : 'Mode cleared');
        }
        return;
      }

      const modes = await listModes();
      const match = modes.find(m => m.name.toLowerCase() === name);
      if (!match) {
        const available = modes.map(m => m.name).join(', ');
        if (!cancelled) {
          onDone(`No mode named "${name}". Available: ${available || '(none)'}. Run /mode list for details.`);
        }
        return;
      }

      const { error } = setActiveMode(match.name);
      if (cancelled) return;
      logEvent('tengu_mode_command', {
        mode: match.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        source: match.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      onDone(
        error
          ? `Mode set to ${match.name} for this session, but saving failed: ${error}`
          : `Mode: ${match.name} — ${match.description}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [name, onDone]);

  return null;
}

function ModeList({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      clearModeDirCache();
      const modes = await listModes();
      if (cancelled) return;
      const active = getActiveModeName();
      const lines = modes.map(m => {
        const marker = m.name.toLowerCase() === active ? '●' : ' ';
        return `${marker} ${m.name}${sourceLabel(m.source)} — ${m.description}`;
      });
      onDone(
        lines.length
          ? `${lines.join('\n')}\n\nActive: ${active ?? 'none'}`
          : 'No modes available. Add one in .clew/modes/*.md',
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return null;
}

function ModePicker({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [modes, setModes] = useState<ModeConfig[] | null>(null);
  const [index, setIndex] = useState(0);
  const active = getActiveModeName();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      clearModeDirCache();
      const loaded = await listModes();
      if (cancelled) return;
      setModes(loaded);
      // Start on the active mode so Enter is a no-op rather than a surprise.
      const activeIndex = loaded.findIndex(m => m.name.toLowerCase() === active);
      setIndex(activeIndex >= 0 ? activeIndex + 1 : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Row 0 is "off"; the rest are modes.
  const rowCount = (modes?.length ?? 0) + 1;

  const confirm = useCallback(() => {
    if (!modes) return;
    if (index === 0) {
      const { error } = setActiveMode(undefined);
      logEvent('tengu_mode_command', { mode: 'off' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS });
      onDone(error ? `Cleared mode for this session, but saving failed: ${error}` : 'Mode cleared');
      return;
    }
    const chosen = modes[index - 1];
    if (!chosen) return;
    const { error } = setActiveMode(chosen.name);
    logEvent('tengu_mode_command', {
      mode: chosen.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: chosen.source as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(
      error
        ? `Mode set to ${chosen.name} for this session, but saving failed: ${error}`
        : `Mode: ${chosen.name} — ${chosen.description}`,
    );
  }, [modes, index, onDone]);

  useInput((_input, key) => {
    if (key.escape) {
      onDone('Mode unchanged.');
      return;
    }
    if (key.return) {
      confirm();
      return;
    }
    if (key.upArrow) {
      setIndex(i => (i - 1 + rowCount) % rowCount);
      return;
    }
    if (key.downArrow) {
      setIndex(i => (i + 1) % rowCount);
    }
  });

  if (!modes) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Loading modes…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Select a mode</Text>
      <Box height={1} />
      <Box flexDirection="column">
        <Text color={index === 0 ? 'suggestion' : undefined}>
          {index === 0 ? '❯ ' : '  '}
          {active === undefined ? '● ' : '  '}
          off
          <Text dimColor> — normal Clew Code behavior</Text>
        </Text>
        {modes.map((mode, i) => {
          const selected = index === i + 1;
          return (
            <Text key={mode.name} color={selected ? 'suggestion' : undefined}>
              {selected ? '❯ ' : '  '}
              {mode.name.toLowerCase() === active ? '● ' : '  '}
              {mode.name}
              <Text dimColor>
                {sourceLabel(mode.source)} — {mode.description}
              </Text>
            </Text>
          );
        })}
      </Box>
      <Box height={1} />
      <Text dimColor>↑/↓ to move · Enter to select · Esc to cancel</Text>
    </Box>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const normalized = args?.trim().toLowerCase() ?? '';

  if (HELP_ARGS.has(normalized)) {
    onDone(HELP_TEXT);
    return;
  }

  if (normalized === 'list' || normalized === 'ls') {
    return <ModeList onDone={onDone} />;
  }

  if (normalized === 'current' || normalized === 'status') {
    const active = getActiveModeName();
    onDone(active ? `Mode: ${active}` : 'No mode set');
    return;
  }

  if (!normalized) {
    return <ModePicker onDone={onDone} />;
  }

  if (normalized === MODE_OFF || normalized === 'none' || normalized === 'clear') {
    return <ApplyModeAndClose name={undefined} onDone={onDone} />;
  }

  return <ApplyModeAndClose name={normalized} onDone={onDone} />;
}
