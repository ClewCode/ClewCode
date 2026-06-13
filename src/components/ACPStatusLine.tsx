import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../ink.js';
import { ACPStatusManager, type ACPStatus } from '../services/acp/ACPStatusManager.js';

export function ACPStatusLine(): React.ReactNode {
  const [status, setStatus] = useState<ACPStatus>({ isRunning: false, activeSessions: 0, transport: null, port: null });

  useEffect(() => {
    const mgr = ACPStatusManager.getInstance();
    const unsubscribe = mgr.changed.subscribe(s => setStatus(s));
    // Initial sync
    setStatus(mgr.getStatus());
    return unsubscribe;
  }, []);

  // Don't render anything if ACP was never started in this session
  if (!status.isRunning && status.activeSessions === 0) return null;

  const dot = status.isRunning ? '🟢' : '🔴';
  const sessionLabel = status.activeSessions === 1 ? 'session' : 'sessions';

  return (
    <Box paddingLeft={1}>
      <Text dimColor>
        {dot} ACP{status.transport === 'websocket' && status.port ? `:${status.port}` : ''}
        {status.activeSessions > 0 ? ` · ${status.activeSessions} ${sessionLabel}` : ''}
      </Text>
    </Box>
  );
}
