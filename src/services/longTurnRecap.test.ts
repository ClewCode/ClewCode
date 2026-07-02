import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Message } from '../types/message.js';

const userMsg = { type: 'user', isMeta: false } as unknown as Message;
const recapMsg = { type: 'system', subtype: 'away_summary' } as unknown as Message;

let configOverride: Record<string, unknown> = { recapEnabled: true, longTurnRecapThresholdMs: 300_000 };
let generateAwaySummaryImpl: (...args: unknown[]) => Promise<string | null> = async () => null;

const realConfig = await import('../utils/config.js');
const realAwaySummary = await import('./awaySummary.js');

mock.module('../utils/config.js', () => ({
  ...realConfig,
  getGlobalConfig: () => configOverride,
}));
mock.module('./awaySummary.js', () => ({
  ...realAwaySummary,
  generateAwaySummary: (...args: unknown[]) => generateAwaySummaryImpl(...args),
}));

const { appendLongTurnRecap, shouldGenerateLongTurnRecap } = await import('./longTurnRecap.js');

describe('shouldGenerateLongTurnRecap', () => {
  beforeEach(() => {
    configOverride = { recapEnabled: true, longTurnRecapThresholdMs: 300_000 };
    delete process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY;
    delete process.env.CLEW_ENABLE_RECAP;
  });

  it('returns false when turn is shorter than threshold', () => {
    expect(shouldGenerateLongTurnRecap(100_000, [userMsg])).toBe(false);
  });

  it('returns true when turn exceeds threshold and no recap exists yet', () => {
    expect(shouldGenerateLongTurnRecap(400_000, [userMsg])).toBe(true);
  });

  it('returns false when recapEnabled is explicitly disabled', () => {
    configOverride = { recapEnabled: false };
    expect(shouldGenerateLongTurnRecap(400_000, [userMsg])).toBe(false);
  });

  it('returns false when a recap already exists since the last user turn', () => {
    expect(shouldGenerateLongTurnRecap(400_000, [userMsg, recapMsg])).toBe(false);
  });

  it('falls back to the default threshold when config value is invalid', () => {
    configOverride = { recapEnabled: true, longTurnRecapThresholdMs: Number.NaN };
    expect(shouldGenerateLongTurnRecap(200_000, [userMsg])).toBe(false); // below default 5min
    expect(shouldGenerateLongTurnRecap(400_000, [userMsg])).toBe(true); // above default 5min
  });
});

describe('appendLongTurnRecap', () => {
  beforeEach(() => {
    configOverride = { recapEnabled: true, longTurnRecapThresholdMs: 300_000 };
    delete process.env.CLAUDE_CODE_ENABLE_AWAY_SUMMARY;
    delete process.env.CLEW_ENABLE_RECAP;
  });

  afterEach(() => {
    generateAwaySummaryImpl = async () => null;
  });

  it('appends a recap message when generation succeeds', async () => {
    generateAwaySummaryImpl = async () => 'Goal: ship it. Next: test it.';
    const calls: unknown[] = [];
    const setMessages = (updater: (prev: Message[]) => Message[]) => calls.push(updater);
    const controller = new AbortController();

    await appendLongTurnRecap([userMsg], 400_000, setMessages, controller.signal);

    expect(calls).toHaveLength(1);
    const updater = calls[0] as (prev: Message[]) => Message[];
    const result = updater([userMsg]);
    expect(result).toHaveLength(2);
    expect((result[1] as any).subtype).toBe('away_summary');
  });

  it('does nothing when the turn is too short', async () => {
    let called = false;
    const setMessages = () => {
      called = true;
    };
    await appendLongTurnRecap([userMsg], 1000, setMessages, new AbortController().signal);
    expect(called).toBe(false);
  });

  it('does nothing when generation returns null', async () => {
    generateAwaySummaryImpl = async () => null;
    let called = false;
    const setMessages = () => {
      called = true;
    };
    await appendLongTurnRecap([userMsg], 400_000, setMessages, new AbortController().signal);
    expect(called).toBe(false);
  });

  it('does nothing when the signal is already aborted', async () => {
    generateAwaySummaryImpl = async () => 'some recap';
    let called = false;
    const setMessages = () => {
      called = true;
    };
    const controller = new AbortController();
    controller.abort();
    await appendLongTurnRecap([userMsg], 400_000, setMessages, controller.signal);
    expect(called).toBe(false);
  });
});
