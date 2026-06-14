/**
 * Session lifecycle integration — auto-save + auto-inject.
 *
 * Call from session start/end hooks or CLI commands.
 */
import { getPreviousSessionContext, saveSessionSummary } from './crossSession.js';
import { recordSessionGraph } from './graph.js';

/**
 * Inject previous session context at session start.
 * Returns meta message string to add to the prompt, or null if no context.
 */
export function injectPreviousSessionContext(): string | null {
  const root = process.cwd();
  return getPreviousSessionContext(root);
}

/**
 * Auto-save the current session to long-term memory.
 * Called at session end.
 *
 * The AI should call this with its own summary of what happened.
 * If summary is empty, saves a minimal record.
 */
export function autoSaveSession(
  summary: string,
  decisions: string[],
  files: string[],
  tags: string[],
  model: string,
  provider: string,
): void {
  const root = process.cwd();
  if (!summary) summary = 'Session ended';
  saveSessionSummary(root, summary, decisions, files, tags);
  recordSessionGraph(root, summary, decisions, files, tags, model, provider);
}

/**
 * Check if there are sessions needing consolidation.
 * Returns a prompt string to show the user, or null.
 */
export function memoryStatusCheck(): string | null {
  const root = process.cwd();
  const ctx = getPreviousSessionContext(root);
  if (ctx) return ctx.split('\n')[2]?.replace(/^Last session/, '💾 Last session');
  return null;
}
