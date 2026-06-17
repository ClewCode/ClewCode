/**
 * RemoteServerStatus — Live status display for Bridge v2 server.
 *
 * Shows connection info, auth token, and active session count
 * when a RemoteServer is running.
 */

import type * as React from 'react';
import { Box, Text } from '../ink.js';

export type RemoteServerStatusProps = {
  running: boolean;
  host: string;
  port: number;
  authToken?: string;
  sessionCount: number;
};

/**
 * Compact one-line status for the prompt footer.
 * Returns null when the server is not running.
 */
export function RemoteServerStatusLine({
  running,
  host,
  port,
  sessionCount,
}: RemoteServerStatusProps): React.ReactNode {
  if (!running) return null;

  return (
    <Box paddingX={1}>
      <Text bold dimColor>
        ◈ remote ws://{host}:{port} [{sessionCount} session{sessionCount === 1 ? '' : 's'}]
      </Text>
    </Box>
  );
}

/**
 * Full status panel with connection details.
 */
export function RemoteServerPanel({
  running,
  host,
  port,
  authToken,
  sessionCount,
}: RemoteServerStatusProps): React.ReactNode {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>Remote Server</Text>
      <Box paddingLeft={2}>{running ? <Text>● Running</Text> : <Text dimColor>○ Stopped</Text>}</Box>
      {running && (
        <>
          <Box paddingLeft={2}>
            <Text>
              WebSocket: ws://{host}:{port}
            </Text>
          </Box>
          {authToken && (
            <Box paddingLeft={2}>
              <Text>
                Token: <Text bold>{authToken}</Text>
              </Text>
            </Box>
          )}
          <Box paddingLeft={2}>
            <Text>Sessions: {sessionCount}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
