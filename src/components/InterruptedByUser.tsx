import type * as React from 'react';
import { Text } from '../ink.js';

export function InterruptedByUser(): React.ReactNode {
  return (
    <>
      <Text dimColor>Interrupted </Text>
      {'external' === 'ant' ? (
        <Text dimColor>· [ANT-ONLY] /issue to report a model issue</Text>
      ) : (
        <Text dimColor>· What should Clew do instead?</Text>
      )}
    </>
  );
}
