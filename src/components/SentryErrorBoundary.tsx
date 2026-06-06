import React from 'react';
import { Box, Text } from '../ink.js';
import { toError } from '../utils/errors.js';
import { captureException } from '../utils/sentry.js';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * React error boundary that captures render errors to Sentry (when enabled).
 *
 * - When Sentry is disabled: captures the error to local logs, shows fallback.
 * - When Sentry is enabled: sends the error to Sentry, shows fallback.
 * - Throttles repeated errors to avoid spamming Sentry.
 *
 * Usage:
 * ```tsx
 * <SentryErrorBoundary>
 *   <App />
 * </SentryErrorBoundary>
 * ```
 */
export class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const componentStack = (errorInfo as unknown as { componentStack?: string })?.componentStack ?? '';
    process.stderr.write(`[SentryErrorBoundary] Caught render error: ${error.message}\n${componentStack}\n`);
    // Send to Sentry when enabled (fire-and-forget, never blocks)
    captureException(error, {
      source: 'react_error_boundary',
      componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      const err = toError(this.state.error);
      return (
        <Box flexDirection="column" padding={1}>
          <Box backgroundColor="red">
            <Text color="white" inverse>
              {' '}
              RENDER ERROR{' '}
            </Text>
          </Box>
          <Text> </Text>
          <Text>{err.message}</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
