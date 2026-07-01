import { randomUUID, type UUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { logEvent } from '../../services/analytics/index.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type {
  ContentReplacementEntry,
  Entry,
  LogOption,
  SerializedMessage,
  TranscriptMessage,
} from '../../types/logs.js';
import { parseJSONL } from '../../utils/json.js';
import {
  getProjectDir,
  getTranscriptPath,
  getTranscriptPathForSession,
  isTranscriptMessage,
  saveCustomTitle,
  searchSessionsByCustomTitle,
} from '../../utils/sessionStorage.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { escapeRegExp } from '../../utils/stringUtils.js';

type TranscriptEntry = TranscriptMessage & {
  forkedFrom?: {
    sessionId: string;
    messageUuid: UUID;
  };
};

/**
 * Derive a single-line title base from the first user message.
 * Collapses whitespace — multiline first messages (pasted stacks, code)
 * otherwise flow into the saved title and break the resume hint.
 */
export function deriveFirstPrompt(firstUserMessage: Extract<SerializedMessage, { type: 'user' }> | undefined): string {
  const content = firstUserMessage?.message?.content;
  if (!content) return 'Branched conversation';
  const raw =
    typeof content === 'string'
      ? content
      : content.find((block): block is { type: 'text'; text: string } => block.type === 'text')?.text;
  if (!raw) return 'Branched conversation';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 100) || 'Branched conversation';
}

/**
 * Creates a fork of the current conversation by copying from the transcript file.
 * Preserves all original metadata (timestamps, gitBranch, etc.) while updating
 * sessionId and adding forkedFrom traceability.
 */
export async function createFork(customTitle?: string): Promise<{
  sessionId: UUID;
  title: string | undefined;
  forkPath: string;
  serializedMessages: SerializedMessage[];
  contentReplacementRecords: ContentReplacementEntry['replacements'];
}> {
  const forkSessionId = randomUUID() as UUID;
  const originalSessionId = getSessionId();
  const projectDir = getProjectDir(getOriginalCwd());
  const forkSessionPath = getTranscriptPathForSession(forkSessionId);
  const currentTranscriptPath = getTranscriptPath();

  // Ensure project directory exists
  await mkdir(projectDir, { recursive: true, mode: 0o700 });

  // Read current transcript file
  // After entering a worktree, getTranscriptPath() resolves to the worktree's
  // project dir which may not have a transcript yet. Fall back to the original
  // CWD's session file so /branch still works after EnterWorktree.
  let transcriptContent: Buffer;
  try {
    transcriptContent = await readFile(currentTranscriptPath);
  } catch {
    try {
      const originalPath = getTranscriptPath(getOriginalCwd());
      transcriptContent = await readFile(originalPath);
    } catch {
      throw new Error('No conversation to branch');
    }
  }

  if (transcriptContent.length === 0) {
    throw new Error('No conversation to branch');
  }

  // Parse all transcript entries (messages + metadata entries like content-replacement)
  const entries = parseJSONL<Entry>(transcriptContent);

  // Filter to only main conversation messages (exclude sidechains and non-message entries)
  const mainConversationEntries = entries.filter(
    (entry): entry is TranscriptMessage => isTranscriptMessage(entry) && !entry.isSidechain,
  );

  // Content-replacement entries for the original session. These record which
  // tool_result blocks were replaced with previews by the per-message budget.
  // Without them in the fork JSONL, `claude -r {forkId}` reconstructs state
  // with an empty replacements Map → previously-replaced results are classified
  // as FROZEN and sent as full content (prompt cache miss + permanent overage).
  // sessionId must be rewritten since loadTranscriptFile keys lookup by the
  // session's messages' sessionId.
  const contentReplacementRecords = entries
    .filter(
      (entry): entry is ContentReplacementEntry =>
        entry.type === 'content-replacement' && entry.sessionId === originalSessionId,
    )
    .flatMap(entry => entry.replacements);

  if (mainConversationEntries.length === 0) {
    throw new Error('No messages to branch');
  }

  // Build forked entries with new sessionId and preserved metadata
  let parentUuid: UUID | null = null;
  const lines: string[] = [];
  const serializedMessages: SerializedMessage[] = [];

  for (const entry of mainConversationEntries) {
    // Create forked transcript entry preserving all original metadata
    const forkedEntry: TranscriptEntry = {
      ...entry,
      sessionId: forkSessionId,
      parentUuid,
      isSidechain: false,
      forkedFrom: {
        sessionId: originalSessionId,
        messageUuid: entry.uuid,
      },
    };

    // Build serialized message for LogOption
    const serialized: SerializedMessage = {
      ...entry,
      sessionId: forkSessionId,
    };

    serializedMessages.push(serialized);
    lines.push(jsonStringify(forkedEntry));
    if (entry.type !== 'progress') {
      parentUuid = entry.uuid;
    }
  }

  // Strip dangling tool_use blocks from the last assistant message. When a
  // fork happens mid-turn (while the model is generating tool calls), the
  // assistant message has tool_use blocks but no corresponding tool_result.
  // Resuming from such a transcript is invalid (missing_results) — the SDK
  // expects every tool_use in the last assistant message to have a matching
  // tool_result in the following user message. Stripping the dangling blocks
  // makes the transcript valid.
  const lastSerialized = serializedMessages[serializedMessages.length - 1];
  if (
    lastSerialized?.type === 'assistant' &&
    lastSerialized.message?.content?.some((c: any) => c.type === 'tool_use')
  ) {
    const hasNextToolResult =
      serializedMessages.length > 1 &&
      serializedMessages[serializedMessages.length - 2]?.type === 'user' &&
      (serializedMessages[serializedMessages.length - 2] as any)?.message?.content?.[0]?.type === 'tool_result';
    if (!hasNextToolResult) {
      lastSerialized.message.content = lastSerialized.message.content.filter((c: any) => c.type !== 'tool_use');
      // If filtering removed all content, fall back to a text placeholder
      if (lastSerialized.message.content.length === 0) {
        lastSerialized.message.content = [{ type: 'text', text: '[forked mid-turn]' }];
      }
      // Also update the last line
      if (lines.length > 0) {
        const lastEntry = jsonParse(lines[lines.length - 1]!);
        if (typeof lastEntry === 'object' && lastEntry !== null) {
          (lastEntry as any).message.content = lastSerialized.message.content;
          lines[lines.length - 1] = jsonStringify(lastEntry);
        }
      }
    }
  }

  // Append content-replacement entry (if any) with the fork's sessionId.
  // Written as a SINGLE entry (same shape as insertContentReplacement) so
  // loadTranscriptFile's content-replacement branch picks it up.
  if (contentReplacementRecords.length > 0) {
    const forkedReplacementEntry: ContentReplacementEntry = {
      type: 'content-replacement',
      sessionId: forkSessionId,
      replacements: contentReplacementRecords,
    };
    lines.push(jsonStringify(forkedReplacementEntry));
  }

  // Write the fork session file
  await writeFile(forkSessionPath, `${lines.join('\n')}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return {
    sessionId: forkSessionId,
    title: customTitle,
    forkPath: forkSessionPath,
    serializedMessages,
    contentReplacementRecords,
  };
}

/**
 * Generates a unique fork name by checking for collisions with existing session names.
 * If "baseName (Branch)" already exists, tries "baseName (Branch 2)", "baseName (Branch 3)", etc.
 */
async function getUniqueForkName(baseName: string): Promise<string> {
  const candidateName = `${baseName} (Branch)`;

  // Check if this exact name already exists
  const existingWithExactName = await searchSessionsByCustomTitle(candidateName, { exact: true });

  if (existingWithExactName.length === 0) {
    return candidateName;
  }

  // Name collision - find a unique numbered suffix
  // Search for all sessions that start with the base pattern
  const existingForks = await searchSessionsByCustomTitle(`${baseName} (Branch`);

  // Extract existing fork numbers to find the next available
  const usedNumbers = new Set<number>([1]); // Consider " (Branch)" as number 1
  const forkNumberPattern = new RegExp(`^${escapeRegExp(baseName)} \\(Branch(?: (\\d+))?\\)$`);

  for (const session of existingForks) {
    const match = session.customTitle?.match(forkNumberPattern);
    if (match) {
      if (match[1]) {
        usedNumbers.add(parseInt(match[1], 10));
      } else {
        usedNumbers.add(1); // " (Branch)" without number is treated as 1
      }
    }
  }

  // Find the next available number
  let nextNumber = 2;
  while (usedNumbers.has(nextNumber)) {
    nextNumber++;
  }

  return `${baseName} (Branch ${nextNumber})`;
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
    const firstPrompt = deriveFirstPrompt(serializedMessages.find(m => m.type === 'user'));

    // Save custom title - use provided title or firstPrompt as default
    // This ensures /status and /resume show the same session name
    // Always add " (Branch)" suffix to make it clear this is a branched session
    // Handle collisions by adding a number suffix (e.g., " (Branch 2)", " (Branch 3)")
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
    const resumeHint = `\nTo resume the original: clew -r ${originalSessionId}`;
    // E38: Include new branch session ID in success message
    const successMessage = `Branched conversation${titleInfo} (id: ${sessionId}). You are now in the branch.${resumeHint}`;

    if (context.resume) {
      await context.resume(sessionId, forkLog, 'fork');
      onDone(successMessage, { display: 'system' });
    } else {
      // Fallback if resume not available
      onDone(`Branched conversation${titleInfo}. Resume with: /resume ${sessionId}`);
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    onDone(`Failed to branch conversation: ${message}`);
    return null;
  }
}
