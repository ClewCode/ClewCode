/**
 * Denial tracking infrastructure for permission classifiers.
 * Tracks consecutive denials and total denials to determine
 * when to fall back to prompting.
 */

export type DenialTrackingState = {
  consecutiveDenials: number
  totalDenials: number
}

export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20,
} as const

export function createDenialTrackingState(): DenialTrackingState {
  return {
    consecutiveDenials: 0,
    totalDenials: 0,
  }
}

export function recordDenial(state: DenialTrackingState): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1,
  }
}

export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  if (state.consecutiveDenials === 0) return state // No change needed
  return {
    ...state,
    consecutiveDenials: 0,
  }
}

export function shouldFallbackToPrompting(state: DenialTrackingState): boolean {
  return (
    state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive ||
    state.totalDenials >= DENIAL_LIMITS.maxTotal
  )
}

/**
 * YOLO stats tracking for YOLO modes
 */
export type YoloStatsState = {
  autoApproved: number
  blockedByGuardian: number
  timeSavedMs: number
  sessionStartTime: number
}

export function createYoloStatsState(): YoloStatsState {
  return {
    autoApproved: 0,
    blockedByGuardian: 0,
    timeSavedMs: 0,
    sessionStartTime: Date.now(),
  }
}

export function recordYoloAutoApproved(state: YoloStatsState): YoloStatsState {
  return {
    ...state,
    autoApproved: state.autoApproved + 1,
  }
}

export function recordYoloGuardianBlock(state: YoloStatsState): YoloStatsState {
  return {
    ...state,
    blockedByGuardian: state.blockedByGuardian + 1,
  }
}

export function addYoloTimeSaved(state: YoloStatsState, ms: number): YoloStatsState {
  return {
    ...state,
    timeSavedMs: state.timeSavedMs + ms,
  }
}

export function formatYoloStats(state: YoloStatsState): string {
  const timeSavedSeconds = (state.timeSavedMs / 1000).toFixed(1)
  const sessionDuration = ((Date.now() - state.sessionStartTime) / 1000).toFixed(0)
  
  return `YOLO Stats:\n` +
    `  Auto-approved: ${state.autoApproved}\n` +
    `  Blocked by Guardian: ${state.blockedByGuardian}\n` +
    `  Time saved: ${timeSavedSeconds}s\n` +
    `  Session duration: ${sessionDuration}s`
}
