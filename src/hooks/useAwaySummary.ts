import { feature } from 'bun:bundle'
import { useEffect, useRef } from 'react'
import {
  getTerminalFocusState,
  subscribeTerminalFocus,
} from '../ink/terminal-focus-state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { generateAwaySummary } from '../services/awaySummary.js'
import type { Message } from '../types/message.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../utils/envUtils.js'
import { isTelemetryDisabled } from '../utils/privacyLevel.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { createAwaySummaryMessage } from '../utils/messages.js'

const BLUR_DELAY_MS = 5 * 60_000

type SetMessages = (updater: (prev: Message[]) => Message[]) => void

function hasSummarySinceLastUserTurn(messages: readonly Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type === 'user' && !m.isMeta && !m.isCompactSummary) return false
    if (m.type === 'system' && m.subtype === 'away_summary') return true
  }
  return false
}

/**
 * Appends a "while you were away" summary message after the terminal has been
 * blurred for 5 minutes. Fires only when (a) 5min since blur, (b) no turn in
 * progress, and (c) no existing away_summary since the last user message.
 *
 * Focus state 'unknown' (terminal doesn't support DECSET 1004) is a no-op.
 */
export function useAwaySummary(
  messages: readonly Message[],
  setMessages: SetMessages,
  isLoading: boolean,
  /** Current prompt input value. When non-empty, the recap is suppressed
   *  to avoid inserting a summary while the user is composing text (E68). */
  inputValue?: string,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef(messages)
  const isLoadingRef = useRef(isLoading)
  const inputValueRef = useRef(inputValue)
  const pendingRef = useRef(false)
  const generateRef = useRef<(() => Promise<void>) | null>(null)

  messagesRef.current = messages
  isLoadingRef.current = isLoading
  inputValueRef.current = inputValue

  // 3P default: false
  const gbEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_sedge_lantern',
    false,
  )

  useEffect(() => {
    if (!feature('AWAY_SUMMARY')) return
    // Opt-out via env var (CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0) or /config setting
    if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY)) return
    // GB-bucketed users always get it. Telemetry-disabled users (DISABLE_TELEMETRY)
    // and users on providers that typically disable telemetry (Bedrock, Vertex,
    // Foundry) also get it — they weren't in the GB cohort.
    const provider = getAPIProvider()
    const noTelemetryProvider = provider === 'bedrock' || provider === 'vertex' || provider === 'foundry'
    if (!gbEnabled && !isTelemetryDisabled() && !noTelemetryProvider) return

    function clearTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    function abortInFlight(): void {
      abortRef.current?.abort()
      abortRef.current = null
    }

    async function generate(): Promise<void> {
      pendingRef.current = false
      if (hasSummarySinceLastUserTurn(messagesRef.current)) return
      abortInFlight()
      const controller = new AbortController()
      abortRef.current = controller
      const text = await generateAwaySummary(
        messagesRef.current,
        controller.signal,
      )
      if (controller.signal.aborted || text === null) return
      setMessages(prev => [...prev, createAwaySummaryMessage(text)])
    }

    function onBlurTimerFire(): void {
      timerRef.current = null
      if (isLoadingRef.current) {
        pendingRef.current = true
        return
      }
      // E68: Don't fire away summary while user has unsent text in the prompt.
      if (inputValueRef.current && inputValueRef.current.trim().length > 0) {
        return
      }
      void generate()
    }

    function onFocusChange(): void {
      const state = getTerminalFocusState()
      if (state === 'blurred') {
        clearTimer()
        timerRef.current = setTimeout(onBlurTimerFire, BLUR_DELAY_MS)
      } else if (state === 'focused') {
        clearTimer()
        abortInFlight()
        pendingRef.current = false
      }
      // 'unknown' → no-op
    }

    const unsubscribe = subscribeTerminalFocus(onFocusChange)
    // Handle the case where we're already blurred when the effect mounts
    onFocusChange()
    generateRef.current = generate

    return () => {
      unsubscribe()
      clearTimer()
      abortInFlight()
      generateRef.current = null
    }
  }, [gbEnabled, setMessages])

  // Timer fired mid-turn → fire when turn ends (if still blurred)
  useEffect(() => {
    if (isLoading) return
    if (!pendingRef.current) return
    if (getTerminalFocusState() !== 'blurred') return
    void generateRef.current?.()
  }, [isLoading])
}
