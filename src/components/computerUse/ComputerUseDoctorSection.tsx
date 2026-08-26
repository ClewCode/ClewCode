import figures from 'figures';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from '../../ink.js';
import {
  type ComputerUseDiagnostics,
  checkComputerUseDependencies,
} from '../../utils/computerUse/platform/diagnostics.js';

export function ComputerUseDoctorSection(): React.ReactNode {
  const [diag, setDiag] = useState<ComputerUseDiagnostics | null>(null);

  useEffect(() => {
    checkComputerUseDependencies().then(setDiag);
  }, []);

  if (!diag) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Computer Use</Text>
        <Text dimColor> Checking dependencies...</Text>
      </Box>
    );
  }

  const { enabled, platform, isReady, dependencies } = diag;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Computer Use</Text>
      <Text>
        └ Active:{' '}
        <Text color={enabled ? 'green' : 'warning'}>{enabled ? 'Yes' : 'No (run with --computer to enable)'}</Text>
      </Text>
      <Text>
        └ Platform: <Text color="cyan">{platform}</Text>
      </Text>
      <Text>
        └ Status: <Text color={isReady ? 'green' : 'error'}>{isReady ? 'Ready' : 'Missing required dependencies'}</Text>
      </Text>
      {dependencies.map(dep => {
        const isOk = dep.status === 'ok';
        const isOptional = dep.type === 'optional';
        const isRecommended = dep.type === 'recommended';

        let statusColor = 'green';
        let statusSymbol = figures.tick;

        if (!isOk) {
          if (isOptional) {
            statusColor = 'gray';
            statusSymbol = '?';
          } else if (isRecommended) {
            statusColor = 'warning';
            statusSymbol = figures.warning;
          } else {
            statusColor = 'error';
            statusSymbol = figures.cross;
          }
        }

        return (
          <Box key={dep.name} flexDirection="column" paddingLeft={2}>
            <Text>
              <Text color={statusColor as any}>
                {statusSymbol} {dep.name}
              </Text>{' '}
              ({dep.type}) - {dep.description}
            </Text>
            {!isOk && dep.fixCommand && (
              <Text dimColor>
                {' '}
                └ Fix: <Text color="cyan">{dep.fixCommand}</Text>
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
