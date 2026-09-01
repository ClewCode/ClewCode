import type * as React from 'react';
import { Text } from '../ink.js';

export function InterruptedByUser(): React.ReactNode {
  return (
    <>
      <Text dimColor>Interrupted </Text>
      {/* @ts-expect-error TS2367 intentional DCE - 'external' vs 'ant' for bun:bundle */}
      {'external' === 'ant' ? (
        <Text dimColor>· [ANT-ONLY] /issue to report a model issue</Text>
      ) : (
        <Text dimColor>· What should Clew do instead?</Text>
      )}
    </>
  );
}
