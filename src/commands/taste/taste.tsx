// Clew taste: Interactive command with Ink UI menu

import { useEffect, useState } from 'react';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Spinner } from '../../components/Spinner.js';
import { Box, Text, useInput } from '../../ink.js';
import type { TasteRuntime } from '../../services/taste/core/TasteRuntime.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { getTasteRuntime, initRuntime } from './index.js';

type Action =
  | 'status'
  | 'toggle'
  | 'init'
  | 'learn'
  | 'forget'
  | 'rules'
  | 'profile'
  | 'events'
  | 'decay'
  | 'eval'
  | 'export'
  | 'close';

const INIT_STAGES = [
  { progress: 15, label: 'Scanning project structure...' },
  { progress: 35, label: 'Analyzing code patterns...' },
  { progress: 55, label: 'Learning coding preferences...' },
  { progress: 75, label: 'Building taste profile...' },
  { progress: 90, label: 'Finalizing...' },
];

function TasteInitProgress({ runtime, onDone }: { runtime: TasteRuntime; onDone: () => void }): React.ReactNode {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      // Animate through stages
      for (let i = 0; i < INIT_STAGES.length; i++) {
        if (cancelled) return;
        setStage(i);
        await new Promise(r => setTimeout(r, 500));
      }

      // Actually initialize
      if (cancelled) return;
      await runtime.initialize();
      if (cancelled) return;
      onDone();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [runtime, onDone]);

  const current = INIT_STAGES[Math.min(stage, INIT_STAGES.length - 1)];
  const barWidth = 20;
  const filled = Math.round((current.progress / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Initializing Clew taste</Text>
      <Text>
        [{bar}] {current.progress}%
      </Text>
      <Text dimColor>{current.label}</Text>
    </Box>
  );
}

const ACTIONS: Array<{ value: Action; label: string; description: string }> = [
  { value: 'status', label: 'Status', description: 'Show current taste status summary' },
  { value: 'toggle', label: 'Toggle on/off', description: 'Enable or disable Clew taste' },
  { value: 'init', label: 'Initialize', description: 'Initialize taste profile and study project patterns' },
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
  const [initializing, setInitializing] = useState(false);

  const runAction = async (action: Action) => {
    setMessage(null);
    setBusyMessage(null);
    switch (action) {
      case 'toggle': {
        const config = runtime.getConfig();
        const enabled = !config.enabled;
        runtime.updateConfig({ enabled });
        const message = enabled ? 'taste enabled' : 'taste disabled';
        runtime.notifyTaste(message.replace('taste ', ''), `taste-${enabled ? 'enabled' : 'disabled'}`, 'medium');
        setMessage(message);
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
      case 'init': {
        setInitializing(true);
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

  if (initializing) {
    return (
      <Dialog
        title="Clew taste"
        subtitle="Local-first preference-learning runtime"
        onCancel={() => onDone('Done.', { display: 'system' })}
        hideInputGuide
      >
        <Box flexDirection="column" gap={1} padding={1}>
          <TasteInitProgress
            runtime={runtime}
            onDone={() => {
              const count = runtime.getRules().length;
              const message = `Taste initialized \u2014 ${count} rule${count === 1 ? '' : 's'} found.\nRun /taste again to manage preferences.`;
              runtime.notifyTaste(message.split('\n')[0]!, 'taste-init', 'medium');
              setInitializing(false);
              onDone(message, { display: 'system' });
            }}
          />
        </Box>
      </Dialog>
    );
  }

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

function InitFlow({ runtime, onDone }: { runtime: TasteRuntime; onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [stage, setStage] = useState<'progress' | 'analyzing' | 'done'>('progress');

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      // Phase 1: Show progress bar for profile init
      for (let i = 0; i < INIT_STAGES.length; i++) {
        if (cancelled) return;
        setStage(i < 3 ? 'progress' : 'analyzing');
        await new Promise(r => setTimeout(r, 400));
      }

      if (cancelled) return;
      setStage('analyzing');

      // Phase 2: AI codebase analysis
      const existingRules = runtime.getRules();
      let result: string;

      if (existingRules.length === 0) {
        try {
          const { TasteCodebaseAnalyzer } = await import('../../services/taste/auto-learn/TasteCodebaseAnalyzer.js');
          const analyzer = new TasteCodebaseAnalyzer();
          const context = analyzer.collectContext();

          if (context.gitLog || Object.keys(context.configFiles).length > 0 || context.projectFiles.length > 0) {
            await runtime.initialize();
            const analysis = await analyzer.analyzeWithAI(context);

            if (analysis.rules.length > 0) {
              let added = 0;
              for (const r of analysis.rules) {
                runtime.addRule(r.text, r.kind, 'inferred', ['ai-detected']);
                added++;
              }
              await runtime.saveProfile();
              const lines = [
                `Taste initialized \u2014 ${added} rule${added === 1 ? '' : 's'} added from codebase analysis.`,
                '',
                ...analysis.rules.map(r => `  [${r.kind}] ${r.text} (confidence: ${(r.confidence * 100).toFixed(0)}%)`),
              ];
              result = lines.join('\n');
              runtime.notifyTaste(lines[0]!, 'taste-init', 'medium');
            } else {
              await runtime.initialize();
              result = 'Taste initialized \u2014 no patterns detected.';
            }
          } else {
            await runtime.initialize();
            result = 'Taste initialized \u2014 no codebase context found.';
          }
        } catch (err) {
          await runtime.initialize();
          result = `Taste initialized \u2014 AI analysis unavailable: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
      } else {
        await runtime.initialize();
        result = `Taste initialized \u2014 ${existingRules.length} rule${existingRules.length === 1 ? '' : 's'} already exist.`;
      }
      runtime.notifyTaste(result.split('\n')[0]!, 'taste-init', 'medium');

      if (cancelled) return;
      setStage('done');
      onDone(result, { display: 'system' });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [runtime, onDone]);

  const s =
    stage === 'done'
      ? INIT_STAGES[INIT_STAGES.length - 1]
      : INIT_STAGES[
          Math.min(Math.floor(INIT_STAGES.length * (stage === 'analyzing' ? 0.6 : 0.3)), INIT_STAGES.length - 1)
        ];

  const barWidth = 20;
  const filled = Math.round((s.progress / 100) * barWidth);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const label = stage === 'analyzing' && s.progress >= 75 ? 'Calling AI to analyze codebase...' : s.label;

  return (
    <Dialog title="Clew taste" subtitle="Local-first preference-learning runtime" hideInputGuide>
      <Box flexDirection="column" gap={1} padding={1}>
        <Text bold>Initializing Clew taste</Text>
        <Text>
          [{bar}] {s.progress}%
        </Text>
        <Text dimColor>{label}</Text>
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
    runtime.notifyTaste('enabled', 'taste-enabled', 'medium');
    onDone('taste enabled', { display: 'system' });
    return null;
  }

  if (arg === 'off') {
    runtime.updateConfig({ enabled: false });
    runtime.notifyTaste('disabled', 'taste-disabled', 'medium');
    onDone('taste disabled', { display: 'system' });
    return null;
  }

  if (
    arg.startsWith('learn ') ||
    arg.startsWith('forget ') ||
    arg.startsWith('suggest') ||
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

  if (arg === 'init') {
    return <InitFlow runtime={runtime} onDone={onDone} />;
  }

  return <TasteMenu onDone={onDone} />;
};
