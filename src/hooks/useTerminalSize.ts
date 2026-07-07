import { useContext } from 'react';
import { type TerminalSize, TerminalSizeContext } from 'src/ink/components/TerminalSizeContext.js';

export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext);

  if (!size) {
    return {
      columns: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    };
  }

  return size;
}
