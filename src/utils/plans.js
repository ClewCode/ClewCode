import { randomUUID } from 'crypto';
import { copyFile, writeFile } from 'fs/promises';
import memoize from 'lodash-es/memoize.js';
import { join, resolve, sep } from 'path';
import { getPlanSlugCache, getSessionId } from '../bootstrap/state.js';
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js';
import { getCwd } from './cwd.js';
import { logForDebugging } from './debug.js';
import { getClaudeConfigHomeDir } from './envUtils.js';
import { isENOENT } from './errors.js';
import { getEnvironmentKind } from './filePersistence/outputsScanner.js';
import { getFsImplementation } from './fsOperations.js';
import { logError } from './log.js';
import { getInitialSettings } from './settings/settings.js';
import { generateWordSlug } from './words.js';

const MAX_SLUG_RETRIES = 10;
// Cache of prompt-prefixes keyed by session ID.
// Set via setPlanSlugPrefix before the first getPlanSlug call so that the
// generated filename incorporates words from the user's prompt rather than
// being a purely random word slug (e.g. "fix-auth-snug-otter.md").
const planSlugPrefixCache = new Map();
/**
 * Sanitize a prompt string for use as a slug prefix: lowercase, keep only
 * alphanumeric and hyphens, limit to ~30 chars, take at most 3 meaningful words.
 */
function sanitizePromptForSlug(prompt) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2 && w.length < 20) // skip very short/long words
    .slice(0, 3);
  return words.join('-');
}
/**
 * Set a prompt-based prefix for the session's plan slug so the generated
 * plan filename includes meaningful words from the prompt.
 * Must be called BEFORE the first getPlanSlug() call for the session.
 */
export function setPlanSlugPrefix(prefix, sessionId) {
  const id = sessionId ?? getSessionId();
  const sanitized = sanitizePromptForSlug(prefix);
  if (sanitized) {
    planSlugPrefixCache.set(id, sanitized);
  }
}
/**
 * Get or generate a word slug for the current session's plan.
 * The slug is generated lazily on first access and cached for the session.
 * If a plan file with the generated slug already exists, retries up to 10 times.
 * When a prompt prefix has been set via setPlanSlugPrefix, it is prepended to
 * the random word slug (e.g. "fix-auth-snug-otter" instead of "snug-otter").
 */
export function getPlanSlug(sessionId) {
  const id = sessionId ?? getSessionId();
  const cache = getPlanSlugCache();
  let slug = cache.get(id);
  if (!slug) {
    const prefix = planSlugPrefixCache.get(id);
    const plansDir = getPlansDirectory();
    // Try to find a unique slug that doesn't conflict with existing files
    for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
      slug = generateWordSlug();
      if (prefix) {
        slug = `${prefix}-${slug}`;
      }
      const filePath = join(plansDir, `${slug}.md`);
      if (!getFsImplementation().existsSync(filePath)) {
        break;
      }
    }
    cache.set(id, slug);
  }
  return slug;
}
/**
 * Set a specific plan slug for a session (used when resuming a session)
 */
export function setPlanSlug(sessionId, slug) {
  getPlanSlugCache().set(sessionId, slug);
}
/**
 * Clear the plan slug for the current session.
 * This should be called on /clear to ensure a fresh plan file is used.
 */
export function clearPlanSlug(sessionId) {
  const id = sessionId ?? getSessionId();
  getPlanSlugCache().delete(id);
}
/**
 * Clear ALL plan slug entries (all sessions).
 * Use this on /clear to free sub-session slug entries.
 */
export function clearAllPlanSlugs() {
  getPlanSlugCache().clear();
}
// Memoized: called from render bodies (FileReadTool/FileEditTool/FileWriteTool UI.tsx)
// and permission checks. Inputs (initial settings + cwd) are fixed at startup, so the
// mkdirSync result is stable for the session. Without memoization, each rendered tool
// message triggers a mkdirSync syscall (regressed in #20005).
export const getPlansDirectory = memoize(function getPlansDirectory() {
  const settings = getInitialSettings();
  const settingsDir = settings.plansDirectory;
  let plansPath;
  if (settingsDir) {
    // Settings.json (relative to project root)
    const cwd = getCwd();
    const resolved = resolve(cwd, settingsDir);
    // Validate path stays within project root to prevent path traversal
    if (!resolved.startsWith(cwd + sep) && resolved !== cwd) {
      logError(new Error(`plansDirectory must be within project root: ${settingsDir}`));
      plansPath = join(getClaudeConfigHomeDir(), 'plans');
    } else {
      plansPath = resolved;
    }
  } else {
    // Default
    plansPath = join(getClaudeConfigHomeDir(), 'plans');
  }
  // Ensure directory exists (mkdirSync with recursive: true is a no-op if it exists)
  try {
    getFsImplementation().mkdirSync(plansPath);
  } catch (error) {
    logError(error);
  }
  return plansPath;
});
/**
 * Get the file path for a session's plan
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 * For main conversation (no agentId), returns {planSlug}.md
 * For subagents (agentId provided), returns {planSlug}-agent-{agentId}.md
 */
export function getPlanFilePath(agentId) {
  const planSlug = getPlanSlug(getSessionId());
  // Main conversation: simple filename with word slug
  if (!agentId) {
    return join(getPlansDirectory(), `${planSlug}.md`);
  }
  // Subagents: include agent ID
  return join(getPlansDirectory(), `${planSlug}-agent-${agentId}.md`);
}
/**
 * Get the plan content for a session
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 */
export function getPlan(agentId) {
  const filePath = getPlanFilePath(agentId);
  try {
    return getFsImplementation().readFileSync(filePath, { encoding: 'utf-8' });
  } catch (error) {
    if (isENOENT(error)) return null;
    logError(error);
    return null;
  }
}
/**
 * Extract the plan slug from a log's message history.
 */
function getSlugFromLog(log) {
  return log.messages.find(m => m.slug)?.slug;
}
/**
 * Restore plan slug from a resumed session.
 * Sets the slug in the session cache so getPlanSlug returns it.
 * If the plan file is missing, attempts to recover it from a file snapshot
 * (written incrementally during the session) or from message history.
 * Returns true if a plan file exists (or was recovered) for the slug.
 * @param log The log to restore from
 * @param targetSessionId The session ID to associate the plan slug with.
 *                        This should be the ORIGINAL session ID being resumed,
 *                        not the temporary session ID from before resume.
 */
export async function copyPlanForResume(log, targetSessionId) {
  const slug = getSlugFromLog(log);
  if (!slug) {
    return false;
  }
  // Set the slug for the target session ID (or current if not provided)
  const sessionId = targetSessionId ?? getSessionId();
  setPlanSlug(sessionId, slug);
  // Attempt to read the plan file directly — recovery triggers on ENOENT.
  const planPath = join(getPlansDirectory(), `${slug}.md`);
  try {
    await getFsImplementation().readFile(planPath, { encoding: 'utf-8' });
    return true;
  } catch (e) {
    if (!isENOENT(e)) {
      // Don't throw — called fire-and-forget (void copyPlanForResume(...)) with no .catch()
      logError(e);
      return false;
    }
    // Only attempt recovery in remote sessions (CCR) where files don't persist
    if (getEnvironmentKind() === null) {
      return false;
    }
    logForDebugging(`Plan file missing during resume: ${planPath}. Attempting recovery.`);
    // Try file snapshot first (written incrementally during session)
    const snapshotPlan = findFileSnapshotEntry(log.messages, 'plan');
    let recovered = null;
    if (snapshotPlan && snapshotPlan.content.length > 0) {
      recovered = snapshotPlan.content;
      logForDebugging(`Plan recovered from file snapshot, ${recovered.length} chars`, { level: 'info' });
    } else {
      // Fall back to searching message history
      recovered = recoverPlanFromMessages(log);
      if (recovered) {
        logForDebugging(`Plan recovered from message history, ${recovered.length} chars`, { level: 'info' });
      }
    }
    if (recovered) {
      try {
        await writeFile(planPath, recovered, { encoding: 'utf-8' });
        return true;
      } catch (writeError) {
        logError(writeError);
        return false;
      }
    }
    logForDebugging('Plan file recovery failed: no file snapshot or plan content found in message history');
    return false;
  }
}
/**
 * Copy a plan file for a forked session. Unlike copyPlanForResume (which reuses
 * the original slug), this generates a NEW slug for the forked session and
 * writes the original plan content to the new file. This prevents the original
 * and forked sessions from clobbering each other's plan files.
 */
export async function copyPlanForFork(log, targetSessionId) {
  const originalSlug = getSlugFromLog(log);
  if (!originalSlug) {
    return false;
  }
  const plansDir = getPlansDirectory();
  const originalPlanPath = join(plansDir, `${originalSlug}.md`);
  // Generate a new slug for the forked session (do NOT reuse the original)
  const newSlug = getPlanSlug(targetSessionId);
  const newPlanPath = join(plansDir, `${newSlug}.md`);
  try {
    await copyFile(originalPlanPath, newPlanPath);
    return true;
  } catch (error) {
    if (isENOENT(error)) {
      return false;
    }
    logError(error);
    return false;
  }
}
/**
 * Recover plan content from the message history. Plan content can appear in
 * three forms depending on what happened during the session:
 *
 * 1. ExitPlanMode tool_use input — normalizeToolInput injects the plan content
 *    into the tool_use input, which persists in the transcript.
 *
 * 2. planContent field on user messages — set during the "clear context and
 *    implement" flow when ExitPlanMode is approved.
 *
 * 3. plan_file_reference attachment — created by auto-compact to preserve the
 *    plan across compaction boundaries.
 */
function recoverPlanFromMessages(log) {
  for (let i = log.messages.length - 1; i >= 0; i--) {
    const msg = log.messages[i];
    if (!msg) {
      continue;
    }
    if (msg.type === 'assistant') {
      const { content } = msg.message;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name === EXIT_PLAN_MODE_V2_TOOL_NAME) {
            const input = block.input;
            const plan = input?.plan;
            if (typeof plan === 'string' && plan.length > 0) {
              return plan;
            }
          }
        }
      }
    }
    if (msg.type === 'user') {
      const userMsg = msg;
      if (typeof userMsg.planContent === 'string' && userMsg.planContent.length > 0) {
        return userMsg.planContent;
      }
    }
    if (msg.type === 'attachment') {
      const attachmentMsg = msg;
      if (attachmentMsg.attachment?.type === 'plan_file_reference') {
        const plan = attachmentMsg.attachment.planContent;
        if (typeof plan === 'string' && plan.length > 0) {
          return plan;
        }
      }
    }
  }
  return null;
}
/**
 * Find a file entry in the most recent file-snapshot system message in the transcript.
 * Scans backwards to find the latest snapshot.
 */
function findFileSnapshotEntry(messages, key) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type === 'system' && 'subtype' in msg && msg.subtype === 'file_snapshot' && 'snapshotFiles' in msg) {
      const files = msg.snapshotFiles;
      return files.find(f => f.key === key);
    }
  }
  return undefined;
}
/**
 * Persist a snapshot of session files (plan, todos) to the transcript.
 * Called incrementally whenever these files change. Only active in remote
 * sessions (CCR) where local files don't persist between sessions.
 */
export async function persistFileSnapshotIfRemote() {
  if (getEnvironmentKind() === null) {
    return;
  }
  try {
    const snapshotFiles = [];
    // Snapshot plan file
    const plan = getPlan();
    if (plan) {
      snapshotFiles.push({
        key: 'plan',
        path: getPlanFilePath(),
        content: plan,
      });
    }
    if (snapshotFiles.length === 0) {
      return;
    }
    const message = {
      type: 'system',
      subtype: 'file_snapshot',
      content: 'File snapshot',
      level: 'info',
      isMeta: true,
      timestamp: new Date().toISOString(),
      uuid: randomUUID(),
      snapshotFiles,
    };
    const { recordTranscript } = await import('./sessionStorage.js');
    await recordTranscript([message]);
  } catch (error) {
    logError(error);
  }
}
