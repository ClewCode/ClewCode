import { getPastedTextRefNumLines } from 'src/history.js';
import type { PastedContent } from 'src/utils/config.js';

const TRUNCATION_THRESHOLD = 10000; // Characters before we truncate
const PREVIEW_LENGTH = 1000; // Characters to show at start and end

type TruncatedMessage = {
  truncatedText: string;
  placeholderContent: string;
};

/**
 * Pattern matching pasted text / image / truncated text references.
 * These must never be split across truncation boundaries.
 */
const REF_PATTERN = /\[(?:Pasted text|Image|Video|\.\.\.Truncated text) #\d+(?: \+\d+ lines)?\.{0,3}\]/g;

/**
 * Find a safe split point near `position` that doesn't cut through
 * a pasted-text/truncated-text reference [...]. Scans forward and
 * backward from `position` to find the nearest reference boundary.
 * Returns the adjusted position (never past `text.length`).
 */
function findSafeSplitPoint(text: string, position: number): number {
  if (position <= 0 || position >= text.length) return position;

  // Check if position lands inside a [...] reference
  const textBefore = text.slice(0, position);
  const _textAfter = text.slice(position);

  // Count opening brackets before position vs closing brackets
  // If inside a ref, we'll see one more '[' than ']'
  const _openBrackets = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    if (textBefore[i] === ']' && (i === 0 || textBefore[i - 1] !== ']' || textBefore[i - 3] === '.')) break;
  }
  // Simpler approach: find the last ref starting before position
  REF_PATTERN.lastIndex = 0;
  let _lastRefEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = REF_PATTERN.exec(text)) !== null) {
    const refEnd = match.index + match[0].length;
    if (refEnd <= position) {
      _lastRefEnd = refEnd;
    } else if (match.index < position && refEnd > position) {
      // Position is INSIDE a reference — extend to end of ref
      return refEnd < text.length ? refEnd : position;
    } else {
      break; // Past position, no more refs
    }
  }

  // Position is not inside a ref, return unchanged
  return position;
}

/**
 * Determines whether the input text should be truncated. If so, it adds a
 * truncated text placeholder and returns the truncated version.
 *
 * @param text The input text
 * @param nextPasteId The reference id to use
 * @returns The new text to display and separate placeholder content if applicable.
 */
export function maybeTruncateMessageForInput(text: string, nextPasteId: number): TruncatedMessage {
  // If the text is short enough, return it as-is
  if (text.length <= TRUNCATION_THRESHOLD) {
    return {
      truncatedText: text,
      placeholderContent: '',
    };
  }

  // Calculate how much text to keep from start and end
  const startLength = Math.floor(PREVIEW_LENGTH / 2);
  const endLength = Math.floor(PREVIEW_LENGTH / 2);

  // H29: Adjust split points to avoid cutting through existing pasted text
  // references (e.g., "[Pasted text #1]"), which would silently drop content.
  const splitStart = findSafeSplitPoint(text, startLength);
  const splitEnd = findSafeSplitPoint(text, text.length - endLength);

  // Extract the portions we'll keep
  const startText = text.slice(0, splitStart);
  const endText = text.slice(splitEnd);

  // Calculate the number of lines that will be truncated
  const placeholderContent = text.slice(splitStart, splitEnd);
  const truncatedLines = getPastedTextRefNumLines(placeholderContent);

  // Create a placeholder reference similar to pasted text
  const placeholderId = nextPasteId;
  const placeholderRef = formatTruncatedTextRef(placeholderId, truncatedLines);

  // Combine the parts with the placeholder
  const truncatedText = startText + placeholderRef + endText;

  return {
    truncatedText,
    placeholderContent,
  };
}

function formatTruncatedTextRef(id: number, numLines: number): string {
  return `[...Truncated text #${id} +${numLines} lines...]`;
}

export function maybeTruncateInput(
  input: string,
  pastedContents: Record<number, PastedContent>,
): { newInput: string; newPastedContents: Record<number, PastedContent> } {
  // Get the next available ID for the truncated content
  const existingIds = Object.keys(pastedContents).map(Number);
  const nextPasteId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

  // Apply truncation
  const { truncatedText, placeholderContent } = maybeTruncateMessageForInput(input, nextPasteId);

  if (!placeholderContent) {
    return { newInput: input, newPastedContents: pastedContents };
  }

  return {
    newInput: truncatedText,
    newPastedContents: {
      ...pastedContents,
      [nextPasteId]: {
        id: nextPasteId,
        type: 'text',
        content: placeholderContent,
      },
    },
  };
}
