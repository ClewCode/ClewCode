import type * as React from 'react';
import { Text } from '../ink.js';
import { getTasteRuntime } from '../services/taste/TasteIntegration.js';

export function TasteStatusLine(): React.ReactNode {
  const runtime = getTasteRuntime();
  if (!runtime.isEnabled()) return null;
  const rules = runtime.getRules();
  return (
    <Text dimColor>
      TASTE <Text color="success">●</Text> {rules.length} rule{rules.length === 1 ? '' : 's'}
    </Text>
  );
}
