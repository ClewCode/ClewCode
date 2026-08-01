/**
 * Thin launchers for one-off dialog JSX sites in main.tsx.
 * Each launcher dynamically imports its component and wires the `done` callback
 * identically to the original inline call site. Zero behavior change.
 *
 * Part of the main.tsx React/JSX extraction effort. See sibling PRs
 * perf/extract-interactive-helpers and perf/launch-repl.
 */
import type React from 'react';
import type { StatsStore } from './context/stats.js';
import type { Root } from './ink.js';
import { renderAndRun, showSetupDialog } from './interactiveHelpers.js';
import { KeybindingSetup } from './keybindings/KeybindingProviderSetup.js';
import type { AppState } from './state/AppStateStore.js';
import type { TeleportRemoteResponse } from './utils/conversationRecovery.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import type { ValidationError } from './utils/settings/validation.js';

// Type-only access to ResumeConversation's Props via the module type.
// No runtime cost - erased at compile time.
type ResumeConversationProps = React.ComponentProps<
  typeof import('./screens/ResumeConversation.js').ResumeConversation
>;

/**
 * Site ~3250: InvalidSettingsDialog (settings validation errors).
 * Original callback wiring: onContinue={done}, onExit passed through from caller.
 */
export async function launchInvalidSettingsDialog(
  root: Root,
  props: {
    settingsErrors: ValidationError[];
    onExit: () => void;
  },
): Promise<void> {
  const { InvalidSettingsDialog } = await import('./components/InvalidSettingsDialog.js');
  return showSetupDialog(root, done => (
    <InvalidSettingsDialog settingsErrors={props.settingsErrors} onContinue={done} onExit={props.onExit} />
  ));
}

/**
 * Site ~4549: TeleportResumeWrapper (interactive teleport session picker).
 * Original callback wiring: onComplete={done}, onCancel={() => done(null)}, source="cliArg".
 */
export async function launchTeleportResumeWrapper(root: Root): Promise<TeleportRemoteResponse | null> {
  const { TeleportResumeWrapper } = await import('./components/TeleportResumeWrapper.js');
  return showSetupDialog<TeleportRemoteResponse | null>(root, done => (
    <TeleportResumeWrapper onComplete={done} onCancel={() => done(null)} source="cliArg" />
  ));
}

/**
 * Site ~4597: TeleportRepoMismatchDialog (pick a local checkout of the target repo).
 * Original callback wiring: onSelectPath={done}, onCancel={() => done(null)}.
 */
export async function launchTeleportRepoMismatchDialog(
  root: Root,
  props: {
    targetRepo: string;
    initialPaths: string[];
  },
): Promise<string | null> {
  const { TeleportRepoMismatchDialog } = await import('./components/TeleportRepoMismatchDialog.js');
  return showSetupDialog<string | null>(root, done => (
    <TeleportRepoMismatchDialog
      targetRepo={props.targetRepo}
      initialPaths={props.initialPaths}
      onSelectPath={done}
      onCancel={() => done(null)}
    />
  ));
}

/**
 * Site ~4903: ResumeConversation mount (interactive session picker).
 * Uses renderAndRun, NOT showSetupDialog. Wraps in <App><KeybindingSetup>.
 * Preserves original Promise.all parallelism between getWorktreePaths and imports.
 */
export async function launchResumeChooser(
  root: Root,
  appProps: {
    getFpsMetrics: () => FpsMetrics | undefined;
    stats: StatsStore;
    initialState: AppState;
  },
  worktreePathsPromise: Promise<string[]>,
  resumeProps: Omit<ResumeConversationProps, 'worktreePaths'>,
): Promise<void> {
  const [worktreePaths, { ResumeConversation }, { App }] = await Promise.all([
    worktreePathsPromise,
    import('./screens/ResumeConversation.js'),
    import('./components/App.js'),
  ]);
  await renderAndRun(
    root,
    <App getFpsMetrics={appProps.getFpsMetrics} stats={appProps.stats} initialState={appProps.initialState}>
      <KeybindingSetup>
        <ResumeConversation {...resumeProps} worktreePaths={worktreePaths} />
      </KeybindingSetup>
    </App>,
  );
}
