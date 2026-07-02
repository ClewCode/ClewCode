import { feature } from 'bun:bundle';
import { useEffect, useRef } from 'react';
import { getTerminalFocusState, subscribeTerminalFocus } from '../ink/terminal-focus-state.js';
import { generateAwaySummary } from '../services/awaySummary.js';
import type { Message } from '../types/message.js';
import { getGlobalConfig } from '../utils/config.js';
import { isEnvDefinedFalsy } from '../utils/envUtils.js';
import { createAwaySummaryMessage } from '../utils/messages.js';

const BLUR_DELAY_MS = 5 * 60_000;

type SetMessages = (updater: (prev: Message[]) => Message[]) => void;

export function hasSummarySinceLastUserTurn(messages: readonly Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.type === 'user' && !m.isMeta && !m.isCompactSummary) return false;
    if (m.type === 'system' && m.subtype === 'away_summary') return true;
  }
  return false;
}

/**
 * Appends a short recap after the terminal has been blurred for a while.
 * Fires only when no turn is in progress and no recap exists since the last
 * user message. Focus state 'unknown' is a no-op.
 */
export function useAwaySummary(
  messages: readonly Message[],
  setMessages: SetMessages,
  isLoading: boolean,
  /** Current prompt input value. When non-empty, the recap is suppressed
   *  to avoid inserting a summary while the user is composing text. */
  inputValue?: string,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const isLoadingRef = useRef(isLoading);
  const inputValueRef = useRef(inputValue);
  const pendingRef = useRef(false);
  const generateRef = useRef<(() => Promise<void>) | null>(null);

  messagesRef.current = messages;
  isLoadingRef.current = isLoading;
  inputValueRef.current = inputValue;

  useEffect(() => {
    if (!feature('AWAY_SUMMARY')) return;
    const config = getGlobalConfig();
    if (config.recapEnabled === false) return;
    if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY)) return;
    if (isEnvDefinedFalsy(process.env.CLEW_ENABLE_RECAP)) return;

    const configuredDelayMs =
      typeof config.recapDelayMs === 'number' && Number.isFinite(config.recapDelayMs) && config.recapDelayMs >= 0
        ? config.recapDelayMs
        : BLUR_DELAY_MS;

    function clearTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    function abortInFlight(): void {
      abortRef.current?.abort();
      abortRef.current = null;
    }

    async function generate(): Promise<void> {
      pendingRef.current = false;
      if (hasSummarySinceLastUserTurn(messagesRef.current)) return;
      abortInFlight();
      const controller = new AbortController();
      abortRef.current = controller;
      const text = await generateAwaySummary(messagesRef.current, controller.signal);
      if (controller.signal.aborted || text === null) return;
      setMessages(prev => [...prev, createAwaySummaryMessage(text)]);
    }

    function onBlurTimerFire(): void {
      timerRef.current = null;
      if (isLoadingRef.current) {
        pendingRef.current = true;
        return;
      }
      if (inputValueRef.current && inputValueRef.current.trim().length > 0) {
        return;
      }
      void generate();
    }

    function onFocusChange(): void {
      const state = getTerminalFocusState();
      if (state === 'blurred') {
        clearTimer();
        timerRef.current = setTimeout(onBlurTimerFire, configuredDelayMs);
      } else if (state === 'focused') {
        clearTimer();
        abortInFlight();
        pendingRef.current = false;
      }
    }

    const unsubscribe = subscribeTerminalFocus(onFocusChange);
    onFocusChange();
    generateRef.current = generate;

    return () => {
      unsubscribe();
      clearTimer();
      abortInFlight();
      generateRef.current = null;
    };
  }, [setMessages]);

  useEffect(() => {
    if (isLoading) return;
    if (!pendingRef.current) return;
    if (getTerminalFocusState() !== 'blurred') return;
    void generateRef.current?.();
  }, [isLoading]);
}
