import type { Message } from '../types/message.js';
import { getGlobalConfig, saveGlobalConfig } from './config.js';
import { tokenCountWithEstimation } from './tokens.js';

/**
 * Sessions at or above this many tokens are expensive enough to resume that we
 * offer summarization first. Roughly the point where a full resume eats a
 * noticeable slice of a 5-hour usage window.
 */
export const RESUME_WARNING_TOKEN_THRESHOLD = 100_000;

/** Sessions older than this are likely stale enough that a summary suffices. */
export const RESUME_WARNING_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

export type ResumeSizeInfo = {
  tokens: number;
  ageMs: number;
};

/**
 * Human-readable age, matching the "17h 27m" style used in the picker.
 * Falls back to minutes-only under an hour, and days above 24h.
 */
export function formatSessionAge(ageMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(ageMs / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** "128.7k" for large counts, plain digits below 1k. */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function describeResumeSize({ tokens, ageMs }: ResumeSizeInfo): string {
  return `This session is ${formatSessionAge(ageMs)} old and ${formatTokenCount(tokens)} tokens.`;
}

export function getResumeSizeInfo(messages: readonly Message[], lastModified: Date, now: number): ResumeSizeInfo {
  return {
    tokens: tokenCountWithEstimation(messages),
    ageMs: now - lastModified.getTime(),
  };
}

/**
 * Whether to interrupt the resume with the summarize/full-session choice.
 * Either dimension alone qualifies: a huge recent session is costly to replay,
 * and an old session is usually better off summarized even when small.
 */
export function shouldWarnBeforeResume(info: ResumeSizeInfo): boolean {
  if (getGlobalConfig().skipResumeSizeWarning === true) return false;
  return info.tokens >= RESUME_WARNING_TOKEN_THRESHOLD || info.ageMs >= RESUME_WARNING_AGE_MS;
}

/** Persist the "Don't ask me again" choice. */
export function suppressResumeSizeWarning(): void {
  saveGlobalConfig(current => ({ ...current, skipResumeSizeWarning: true }));
}
