import { getSessionId } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { logEvent } from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { LogOption } from '../../types/logs.js';
import { saveCustomTitle, searchSessionsByCustomTitle } from '../../utils/sessionStorage.js';
import { escapeRegExp } from '../../utils/stringUtils.js';
import { createFork, deriveFirstPrompt } from '../branch/branch.js';

/**
 * Generates a unique fork name by checking for collisions with existing session names.
 * If "baseName (Fork)" already exists, tries "baseName (Fork 2)", "baseName (Fork 3)", etc.
 */
async function getUniqueForkName(baseName: string): Promise<string> {
  const candidateName = `${baseName} (Fork)`;

  // Check if this exact name already exists
  const existingWithExactName = await searchSessionsByCustomTitle(candidateName, { exact: true });

  if (existingWithExactName.length === 0) {
    return candidateName;
  }

  // Name collision - find a unique numbered suffix
  // Search for all sessions that start with the base pattern
  const existingForks = await searchSessionsByCustomTitle(`${baseName} (Fork`);

  // Extract existing fork numbers to find the next available
  const usedNumbers = new Set<number>([1]); // Consider " (Fork)" as number 1
  const forkNumberPattern = new RegExp(`^${escapeRegExp(baseName)} \\(Fork(?: (\\d+))?\\)$`);

  for (const session of existingForks) {
    const match = session.customTitle?.match(forkNumberPattern);
    if (match) {
      if (match[1]) {
        usedNumbers.add(parseInt(match[1], 10));
      } else {
        usedNumbers.add(1); // " (Fork)" without number is treated as 1
      }
    }
  }

  // Find the next available number
  let nextNumber = 2;
  while (usedNumbers.has(nextNumber)) {
    nextNumber++;
  }

  return `${baseName} (Fork ${nextNumber})`;
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  // Collapse internal whitespace (including newlines from pasted multi-line names)
  // so the title doesn't break the resume hint or session list display.
  const customTitle = args?.replace(/\s+/g, ' ').trim() || undefined;

  const originalSessionId = getSessionId();

  try {
    const { sessionId, title, forkPath, serializedMessages, contentReplacementRecords } = await createFork(customTitle);

    // Build LogOption for resume
    const now = new Date();
    const firstUserMessage = serializedMessages.find(
      (m): m is Extract<typeof m, { type: 'user' }> => m.type === 'user',
    );
    const firstPrompt = deriveFirstPrompt(firstUserMessage);

    // Save custom title with (Fork) suffix to make it clear this is a forked session
    // Handle collisions by adding a number suffix (e.g., " (Fork 2)", " (Fork 3)")
    const baseName = title ?? firstPrompt;
    const effectiveTitle = await getUniqueForkName(baseName);
    await saveCustomTitle(sessionId, effectiveTitle, forkPath);

    logEvent('tengu_conversation_forked', {
      message_count: serializedMessages.length,
      has_custom_title: !!title,
    });

    const forkLog: LogOption = {
      date: now.toISOString().split('T')[0]!,
      messages: serializedMessages,
      fullPath: forkPath,
      value: now.getTime(),
      created: now,
      modified: now,
      firstPrompt,
      messageCount: serializedMessages.length,
      isSidechain: false,
      sessionId,
      customTitle: effectiveTitle,
      contentReplacements: contentReplacementRecords,
    };

    // Resume into the fork
    const titleInfo = title ? ` "${title}"` : '';
    const resumeHint = `\nTo resume the original: /resume ${originalSessionId}`;
    const successMessage = `Forked conversation${titleInfo} (id: ${sessionId}). You are now in the fork.${resumeHint}`;

    if (context.resume) {
      await context.resume(sessionId, forkLog, 'fork');
      onDone(successMessage, { display: 'system' });
    } else {
      // Fallback if resume not available
      onDone(`Forked conversation${titleInfo}. Resume with: /resume ${sessionId}`);
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    onDone(`Failed to fork conversation: ${message}`);
    return null;
  }
}
