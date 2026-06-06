// Clew taste: Interactive command with Ink UI menu

import { useState } from 'react';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Spinner } from '../../components/Spinner.js';
import { Box, Text, useInput } from '../../ink.js';
import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { getTasteRuntime, initRuntime } from './index.js';

type Action =
  | 'status'
  | 'toggle'
  | 'learn'
  | 'forget'
  | 'rules'
  | 'profile'
  | 'events'
  | 'decay'
  | 'eval'
  | 'export'
  | 'close';

const ACTIONS: Array<{ value: Action; label: string; description: string }> = [
  { value: 'status', label: 'Status', description: 'Show current taste status summary' },
  { value: 'toggle', label: 'Toggle on/off', description: 'Enable or disable Clew taste' },
  { value: 'learn', label: 'Learn a rule', description: 'Add a new preference rule manually' },
  { value: 'forget', label: 'Forget a rule', description: 'Remove a rule by ID' },
  { value: 'rules', label: 'List rules', description: 'View all learned rules' },
  { value: 'profile', label: 'Profile info', description: 'Show taste profile details' },
  { value: 'events', label: 'Recent events', description: 'Show recent taste learning events' },
  { value: 'decay', label: 'Apply decay', description: 'Run confidence decay on stale rules' },
  { value: 'eval', label: 'Evaluate', description: 'Run self-evaluation of the taste system' },
  { value: 'export', label: 'Export profile', description: 'Export taste profile to a package file' },
  { value: 'close', label: 'Close', description: 'Exit the taste menu' },
];

function StatusSummary({ runtime }: { runtime: TasteRuntime }) {
  const config = runtime.getConfig();
  const profile = runtime.getProfile();
  const rules = runtime.getRules();
  const arm = runtime.getCurrentArm();
  const kindCounts: Record<string, number> = {};
  for (const rule of rules) {
    kindCounts[rule.kind] = (kindCounts[rule.kind] ?? 0) + 1;
  }
  const topKinds = Object.entries(kindCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  return (
    <Box flexDirection="column">
      <Text>
        Clew taste <Text color={config.enabled ? 'green' : 'red'}>{config.enabled ? 'ENABLED' : 'DISABLED'}</Text>
        {' · '}
        <Text dimColor>{profile.projectId || 'no project'}</Text>
      </Text>
      <Text dimColor>
        {rules.length} rules · {profile.stats.totalEvents} events · arm: {arm}
      </Text>
      {topKinds.length > 0 && <Text dimColor>top kinds: {topKinds.map(([k, n]) => `${k} (${n})`).join(', ')}</Text>}
    </Box>
  );
}

function TasteMenu({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const [runtime] = useState(() => getTasteRuntime());
  const [focused, setFocused] = useState(0);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runAction = async (action: Action) => {
    setMessage(null);
    setBusyMessage(null);
    switch (action) {
      case 'toggle': {
        const config = runtime.getConfig();
        runtime.updateConfig({ enabled: !config.enabled });
        setMessage(config.enabled ? 'taste disabled' : 'taste enabled');
        return;
      }
      case 'status': {
        const config = runtime.getConfig();
        const profile = runtime.getProfile();
        const rules = runtime.getRules();
        onDone(
          [
            `Clew taste: ${config.enabled ? 'ENABLED' : 'DISABLED'}`,
            `Profile: ${profile.projectId} (${rules.length} rules)`,
            `Events: ${profile.stats.totalEvents} (${profile.stats.totalAccepts} accepts, ${profile.stats.totalRejects} rejects)`,
            `Bandit arm: ${runtime.getCurrentArm()}`,
            `Prompt injection: ${config.injectPrompts ? 'on' : 'off'}`,
            `Auto-learn: ${config.autoLearn ? 'on' : 'off'}`,
            `Decay: ${config.decayEnabled ? 'on' : 'off'}`,
            `Min confidence: ${config.minConfidence}`,
          ].join('\n'),
          { display: 'system' },
        );
        return;
      }
      case 'learn':
        onDone(undefined, { display: 'skip', nextInput: '/taste learn ', submitNextInput: false });
        return;
      case 'forget':
        onDone(undefined, { display: 'skip', nextInput: '/taste forget ', submitNextInput: false });
        return;
      case 'rules': {
        const rules = runtime.getRules();
        if (rules.length === 0) {
          setMessage('No rules learned yet.');
          return;
        }
        const lines = rules.map(
          r =>
            `[${r.id.slice(0, 8)}] ${r.text} (kind: ${r.kind}, confidence: ${r.confidence.toFixed(2)}, source: ${r.source})`,
        );
        onDone(`Rules (${rules.length}):\n${lines.join('\n')}`, { display: 'system' });
        return;
      }
      case 'profile': {
        const profile = runtime.getProfile();
        onDone(
          [
            `Taste profile: ${profile.projectId}`,
            `Version: ${profile.version}`,
            `Rules: ${profile.rules.length}`,
            `Events: ${profile.stats.totalEvents}`,
            `Last updated: ${profile.stats.lastUpdatedAt}`,
          ].join('\n'),
          { display: 'system' },
        );
        return;
      }
      case 'events': {
        const events = runtime.getEventLog().getRecentEvents(20);
        if (events.length === 0) {
          setMessage('No events recorded yet.');
          return;
        }
        const lines = events.map(
          e =>
            `${e.timestamp.slice(0, 19)} [${e.type}] reward=${e.reward.toFixed(2)}${e.prompt ? ` "${e.prompt.slice(0, 60)}"` : ''}`,
        );
        onDone(`Recent events (${events.length}):\n${lines.join('\n')}`, { display: 'system' });
        return;
      }
      case 'decay': {
        setBusy(true);
        setBusyMessage('Applying decay...');
        const count = await runtime.applyDecay();
        setBusy(false);
        setBusyMessage(null);
        setMessage(`Decay applied: ${count} rules affected.`);
        return;
      }
      case 'eval': {
        setBusy(true);
        setBusyMessage('Evaluating...');
        const { TasteEvaluator } = await import('../../services/taste/eval/TasteEvaluator.js');
        const profile = runtime.getProfile();
        const result = new TasteEvaluator().evaluate(profile);
        setBusy(false);
        setBusyMessage(null);
        onDone(
          [
            result.summary,
            `Neural score: ${result.neuralScore.toFixed(3)}`,
            `Symbolic checks: ${result.symbolicChecks.filter(c => c.passed).length}/${result.symbolicChecks.length} passed`,
          ].join('\n'),
          { display: 'system' },
        );
        return;
      }
      case 'export':
        onDone(undefined, { display: 'skip', nextInput: '/taste export', submitNextInput: true });
        return;
      case 'close':
        onDone('Done.', { display: 'system' });
        return;
    }
  };

  useInput(
    (_input, key) => {
      if (busy) return;
      if (key.escape) {
        onDone('Done.', { display: 'system' });
        return;
      }
      if (key.upArrow) {
        setFocused(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || key.tab) {
        setFocused(i => Math.min(ACTIONS.length - 1, i + 1));
        return;
      }
      if (key.return) {
        void runAction(ACTIONS[focused]!.value);
      }
    },
    { isActive: true },
  );

  return (
    <Dialog
      title="Clew taste"
      subtitle="Local-first preference-learning runtime"
      onCancel={() => onDone('Done.', { display: 'system' })}
      hideInputGuide
    >
      <Box flexDirection="column" gap={1}>
        <StatusSummary runtime={runtime} />
        <Box flexDirection="column">
          {ACTIONS.map((action, index) => {
            const isFocused = index === focused;
            return (
              <Text key={action.value}>
                <Text color={isFocused ? 'suggestion' : undefined}>{isFocused ? '> ' : '  '}</Text>
                <Text bold={isFocused}>{action.label.padEnd(18)}</Text>
                <Text dimColor>{action.description}</Text>
              </Text>
            );
          })}
        </Box>
        {busy && (
          <Box>
            <Spinner />
            <Text> {busyMessage || 'Working...'}</Text>
          </Box>
        )}
        {!busy && message && <Text color="success">{message}</Text>}
        {!busy && <Text dimColor>↑↓ navigate · Enter select · Esc close</Text>}
      </Box>
    </Dialog>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const arg = args.trim();

  const runtime = getTasteRuntime();
  try {
    await initRuntime();
  } catch {
    // Runtime may already be initialized
  }

  if (arg === 'on') {
    runtime.updateConfig({ enabled: true });
    onDone('taste enabled', { display: 'system' });
    return null;
  }

  if (arg === 'off') {
    runtime.updateConfig({ enabled: false });
    onDone('taste disabled', { display: 'system' });
    return null;
  }

  if (
    arg.startsWith('learn ') ||
    arg.startsWith('forget ') ||
    arg === 'profile' ||
    arg === 'events' ||
    arg === 'decay' ||
    arg === 'eval' ||
    arg === 'export' ||
    arg === 'import' ||
    arg === 'status'
  ) {
    const { handleNonInteractive } = await import('./taste-noninteractive.js');
    const result = await handleNonInteractive(arg, runtime);
    onDone(result, { display: 'system' });
    return null;
  }

  return <TasteMenu onDone={onDone} />;
};
