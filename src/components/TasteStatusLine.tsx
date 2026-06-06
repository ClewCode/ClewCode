import type * as React from 'react';
import { Box, Text } from '../ink.js';
import { getTasteRuntime } from '../services/taste/TasteIntegration.js';

export function TasteStatusLine(): React.ReactNode {
  const runtime = getTasteRuntime();
  const config = runtime.getConfig();
  if (!config.enabled) return null;

  const rules = runtime.getRules();
  if (rules.length === 0) return null;

  return (
    <Box paddingX={1}>
      <Text bold dimColor>
        ⓘ taste: {rules.length} rule{rules.length === 1 ? '' : 's'}
      </Text>
    </Box>
  );
}
