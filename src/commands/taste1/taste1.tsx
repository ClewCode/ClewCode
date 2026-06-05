// Clew taste-1: Interactive command with Ink UI panel

import { Box, Text } from '../../ink.js';
import type { Taste1Runtime } from '../../services/taste1/core/Taste1Runtime.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { getTaste1Runtime, initRuntime } from './index.js';

type Taste1PanelProps = {
  runtime: Taste1Runtime;
};

function Taste1Panel({ runtime }: Taste1PanelProps) {
  const profile = runtime.getProfile();
  const config = runtime.getConfig();
  const rules = runtime.getRules();
  const arm = runtime.getCurrentArm();

  // Count by kind
  const kindCounts: Record<string, number> = {};
  for (const rule of rules) {
    kindCounts[rule.kind] = (kindCounts[rule.kind] ?? 0) + 1;
  }
  const topKinds = Object.entries(kindCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Recent events
  const recentEvents = runtime.getEventLog().getRecentEvents(5);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>
        {' '}
        Clew taste-1 <Text color={config.enabled ? 'green' : 'red'}>{config.enabled ? 'ENABLED' : 'DISABLED'}</Text>
      </Text>
      <Text> </Text>

      <Text bold>Configuration</Text>
      <Text> Inject prompts: {config.injectPrompts ? 'yes' : 'no'}</Text>
      <Text> Auto-learn: {config.autoLearn ? 'yes' : 'no'}</Text>
      <Text> Validate edits: {config.validateEdits ? 'yes' : 'no'}</Text>
      <Text> Bandit arm: {arm}</Text>
      <Text> Decay enabled: {config.decayEnabled ? 'yes' : 'no'}</Text>
      <Text> </Text>

      <Text bold>Rules</Text>
      <Text> Total: {rules.length}</Text>
      <Text> High confidence (&gt;=0.7): {rules.filter(r => r.confidence >= 0.7).length}</Text>
      <Text> Top kinds: {topKinds.map(([k, n]) => `${k} (${n})`).join(', ')}</Text>
      <Text> </Text>

      <Text bold>Stats</Text>
      <Text> Events: {profile.stats.totalEvents}</Text>
      <Text> Accepts: {profile.stats.totalAccepts}</Text>
      <Text> Rejects: {profile.stats.totalRejects}</Text>
      <Text> Edits tracked: {profile.stats.totalEdits}</Text>
      <Text> </Text>

      {recentEvents.length > 0 && (
        <>
          <Text bold>Recent events</Text>
          {recentEvents.slice(-3).map(e => (
            <Text key={e.id}>
              {'  '}
              <Text color={e.reward > 0 ? 'green' : e.reward < 0 ? 'red' : 'yellow'}>{e.type}</Text> reward=
              {e.reward.toFixed(2)} {e.timestamp.slice(0, 10)}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const arg = args.trim();

  // Initialize runtime
  const runtime = getTaste1Runtime();
  try {
    await initRuntime();
  } catch {
    // Runtime may already be initialized
  }

  if (arg === 'on') {
    runtime.updateConfig({ enabled: true });
    onDone('taste-1 enabled', { display: 'system' });
    return null;
  }

  if (arg === 'off') {
    runtime.updateConfig({ enabled: false });
    onDone('taste-1 disabled', { display: 'system' });
    return null;
  }

  // Subcommands are handled in non-interactive mode
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
    // Delegate to non-interactive handler
    const { handleNonInteractive } = await import('./taste1-noninteractive.js');
    const result = await handleNonInteractive(arg, runtime);
    onDone(result, { display: 'system' });
    return null;
  }

  // Default: show the Ink panel
  return <Taste1Panel runtime={runtime} />;
};
