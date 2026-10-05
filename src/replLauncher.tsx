import type React from 'react';
import { SentryErrorBoundary } from './components/SentryErrorBoundary.js';
import type { StatsStore } from './context/stats.js';
import type { Root } from './ink.js';
import type { Props as REPLProps } from './screens/REPL.js';
import type { AppState } from './state/AppStateStore.js';
import type { FpsMetrics } from './utils/fpsTracker.js';

type AppWrapperProps = {
  getFpsMetrics: () => FpsMetrics | undefined;
  stats?: StatsStore;
  initialState: AppState;
};
export async function launchRepl(
  root: Root,
  appProps: AppWrapperProps,
  replProps: REPLProps,
  renderAndRun: (root: Root, element: React.ReactNode) => Promise<void>,
): Promise<void> {
  const { App } = await import('./components/App.js');
  const { REPL } = await import('./screens/REPL.js');
  const { Splash } = await import('./components/LogoV2/Splash.js');
  await renderAndRun(
    root,
    <SentryErrorBoundary>
      <App {...appProps}>
        <Splash>
          <REPL {...replProps} />
        </Splash>
      </App>
    </SentryErrorBoundary>,
  );
}
