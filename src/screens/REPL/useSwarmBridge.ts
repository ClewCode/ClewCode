import { useRef } from 'react';

export type SwarmBudgetInfo = { tokens: number; limit: number; nudges: number };

/** Session-scoped refs shared by the REPL's swarm lifecycle callbacks. */
export function useSwarmBridge() {
  const swarmStartTimeRef = useRef<number | null>(null);
  const swarmBudgetInfoRef = useRef<SwarmBudgetInfo | undefined>(undefined);
  return { swarmStartTimeRef, swarmBudgetInfoRef };
}
