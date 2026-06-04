/**
 * Denial tracking infrastructure for permission classifiers.
 * Tracks consecutive denials and total denials to determine
 * when to fall back to prompting or trigger circuit breaker.
 */

export type DenialTrackingState = {
  consecutiveDenials: number;
  totalDenials: number;
  /** Guardian-specific: denials in rolling window of last N reviews */
  guardianDenialsInWindow: number;
  guardianTotalReviews: number;
};

export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20,
  /** Guardian circuit breaker: 3 consecutive denials → interrupt turn */
  guardianMaxConsecutive: 3,
  /** Guardian circuit breaker: 10 denials in last 50 reviews */
  guardianMaxInWindow: 10,
  guardianWindowSize: 50,
} as const;

export function createDenialTrackingState(): DenialTrackingState {
  return {
    consecutiveDenials: 0,
    totalDenials: 0,
    guardianDenialsInWindow: 0,
    guardianTotalReviews: 0,
  };
}

export function recordDenial(state: DenialTrackingState): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1,
  };
}

export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  if (state.consecutiveDenials === 0) return state;
  return {
    ...state,
    consecutiveDenials: 0,
  };
}

export function shouldFallbackToPrompting(state: DenialTrackingState): boolean {
  return state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive || state.totalDenials >= DENIAL_LIMITS.maxTotal;
}

/**
 * Record a guardian review result (allow or deny).
 * Tracks the rolling window for circuit breaker.
 */
export function recordGuardianReview(
  state: DenialTrackingState,
  allowed: boolean,
): DenialTrackingState {
  const newTotal = state.guardianTotalReviews + 1;
  // If we've accumulated window_size reviews, the window is saturated;
  // approximate the in-window denial count as a decaying ratio.
  const newInWindow = allowed
    ? state.guardianDenialsInWindow // allow doesn't change denial count
    : newTotal <= DENIAL_LIMITS.guardianWindowSize
      ? state.guardianDenialsInWindow + 1
      : // Beyond window: approximate decay
        Math.max(0, state.guardianDenialsInWindow - Math.floor(state.guardianDenialsInWindow / DENIAL_LIMITS.guardianWindowSize) + 1);

  return {
    ...state,
    consecutiveDenials: allowed ? 0 : state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + (allowed ? 0 : 1),
    guardianDenialsInWindow: newInWindow,
    guardianTotalReviews: newTotal,
  };
}

/**
 * Check if the guardian circuit breaker should trip.
 * Returns true when the turn should be interrupted.
 */
export function shouldTripGuardianCircuitBreaker(state: DenialTrackingState): boolean {
  // 3 consecutive denials
  if (state.consecutiveDenials >= DENIAL_LIMITS.guardianMaxConsecutive) return true;
  // 10 denials in last 50 reviews
  if (
    state.guardianTotalReviews >= DENIAL_LIMITS.guardianWindowSize &&
    state.guardianDenialsInWindow >= DENIAL_LIMITS.guardianMaxInWindow
  ) {
    return true;
  }
  return false;
}

/**
 * Reset the guardian circuit breaker (called on /guardian reset or new turn).
 */
export function resetGuardianBreaker(state: DenialTrackingState): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: 0,
    guardianDenialsInWindow: 0,
    guardianTotalReviews: 0,
  };
}
