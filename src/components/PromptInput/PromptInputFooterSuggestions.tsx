import { memo, type ReactNode } from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { stringWidth } from '../../ink/stringWidth.js';
import { Box, Text } from '../../ink.js';
import { truncatePathMiddle, truncateToWidth } from '../../utils/format.js';
import type { Theme } from '../../utils/theme.js';

export type SuggestionItem = {
  id: string;
  displayText: string;
  tag?: string;
  description?: string;
  metadata?: unknown;
  color?: keyof Theme;
};

export type SuggestionType =
  | 'command'
  | 'file'
  | 'directory'
  | 'agent'
  | 'shell'
  | 'custom-title'
  | 'slack-channel'
  | 'none';

export const OVERLAY_MAX_ITEMS = 5;

function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, ' ').trim();
}

/**
 * Get the icon for a suggestion based on its type
 * Icons: + for files, ◇ for MCP resources, * for agents
 */
function getIcon(itemId: string): string {
  if (itemId.startsWith('file-')) return '+';
  if (itemId.startsWith('mcp-resource-')) return '◇';
  if (itemId.startsWith('agent-')) return '*';
  return '+';
}

/**
 * Check if an item is a unified suggestion type (file, mcp-resource, or agent)
 */
function isUnifiedSuggestion(itemId: string): boolean {
  return itemId.startsWith('file-') || itemId.startsWith('mcp-resource-') || itemId.startsWith('agent-');
}

const SuggestionItemRow = memo(function SuggestionItemRow({
  item,
  isSelected,
}: {
  item: SuggestionItem;
  isSelected: boolean;
}): ReactNode {
  const columns = useTerminalSize().columns;
  const isUnified = isUnifiedSuggestion(item.id);

  // For unified suggestions (file, mcp-resource, agent), use single-line layout with icon
  if (isUnified) {
    const icon = getIcon(item.id);
    const textColor: keyof Theme | undefined = isSelected ? 'suggestion' : undefined;
    const dimColor = !isSelected;

    const isFile = item.id.startsWith('file-');
    const isMcpResource = item.id.startsWith('mcp-resource-');

    // Calculate layout widths
    // Layout: "X " (2) + displayText + " – " (3) + description + padding (4)
    const iconWidth = 2; // icon + space (fixed)
    const paddingWidth = 4;
    const separatorWidth = item.description ? 3 : 0; // ' – ' separator

    // For files, truncate middle of path to show both directory context and filename
    // For MCP resources, limit displayText to 30 chars (truncate from end)
    // For agents, no truncation
    let displayText: string;
    if (isFile) {
      // Reserve space for description if present, otherwise use all available space
      const descReserve = item.description ? Math.min(20, stringWidth(item.description)) : 0;
      const maxPathLength = columns - iconWidth - paddingWidth - separatorWidth - descReserve;
      displayText = truncatePathMiddle(item.displayText, maxPathLength);
    } else if (isMcpResource) {
      const maxDisplayTextLength = 30;
      displayText = truncateToWidth(item.displayText, maxDisplayTextLength);
    } else {
      displayText = item.displayText;
    }

    const availableWidth = columns - iconWidth - stringWidth(displayText) - separatorWidth - paddingWidth;

    // Build the full line as a single string to prevent wrapping
    let lineContent: string;
    if (item.description) {
      const maxDescLength = Math.max(0, availableWidth);
      const truncatedDesc = truncateToWidth(item.description.replace(/\s+/g, ' '), maxDescLength);
      lineContent = `${icon} ${displayText} – ${truncatedDesc}`;
    } else {
      lineContent = `${icon} ${displayText}`;
    }

    return (
      <Text color={textColor} dimColor={dimColor} wrap="truncate">
        {lineContent}
      </Text>
    );
  }

  const textColor = item.color || (isSelected ? 'suggestion' : undefined);
  const shouldDim = !isSelected;

  const tagText = item.tag ? `[${item.tag}] ` : '';
  const tagWidth = stringWidth(tagText);
  // Skill descriptions can contain newlines (e.g. /claude-api's "TRIGGER
  // when:" block). A multi-line row grows the overlay past minHeight; when
  // the filter narrows past that skill, the overlay shrinks and leaves
  // ghost rows. Flatten to one line before truncating.
  const description = item.description ? normalizeDescription(item.description) : '';
  const displayTextWidth = Math.max(8, columns - tagWidth - 4);
  const displayText = truncateToWidth(item.displayText, displayTextWidth);
  const detailWidth = Math.max(0, columns - 6);

  return (
    <Box flexDirection="column">
      <Text wrap="truncate">
        <Text color={textColor} dimColor={shouldDim}>
          {displayText}
        </Text>
        {tagText ? <Text dimColor> {tagText}</Text> : null}
      </Text>
      {description ? (
        <Text color={isSelected ? 'suggestion' : undefined} dimColor={!isSelected} wrap="truncate">
          {'  '}
          {truncateToWidth(description, detailWidth)}
        </Text>
      ) : null}
    </Box>
  );
});

type Props = {
  suggestions: SuggestionItem[];
  selectedSuggestion: number;
  maxColumnWidth?: number;
  /**
   * When true, the suggestions are rendered inside a position=absolute
   * overlay. We omit minHeight and flex-end so the y-clamp in the
   * renderer doesn't push fewer items down into the prompt area.
   */
  overlay?: boolean;
};

export function PromptInputFooterSuggestions({
  suggestions,
  selectedSuggestion,
  maxColumnWidth: maxColumnWidthProp,
  overlay,
}: Props): ReactNode {
  const { rows } = useTerminalSize();
  const hasTwoLineRows = suggestions.some(item => !isUnifiedSuggestion(item.id) && item.description);
  // Maximum number of suggestions to show at once (leaving space for prompt).
  // Overlay mode (fullscreen) uses a fixed 5 — the floating box sits over
  // the ScrollBox, so terminal height isn't the constraint.
  const maxVisibleItems = hasTwoLineRows
    ? overlay
      ? Math.min(4, OVERLAY_MAX_ITEMS)
      : Math.min(4, Math.max(1, Math.floor((rows - 3) / 2)))
    : overlay
      ? OVERLAY_MAX_ITEMS
      : Math.min(6, Math.max(1, rows - 3));

  // No suggestions to display
  if (suggestions.length === 0) {
    return null;
  }

  // Kept for API compatibility with callers that still pass stable column width.
  void maxColumnWidthProp;

  // Calculate visible items range based on selected index
  const startIndex = Math.max(
    0,
    Math.min(selectedSuggestion - Math.floor(maxVisibleItems / 2), suggestions.length - maxVisibleItems),
  );
  const endIndex = Math.min(startIndex + maxVisibleItems, suggestions.length);
  const visibleItems = suggestions.slice(startIndex, endIndex);

  // In non-overlay (inline) mode, justifyContent keeps suggestions
  // anchored to the bottom (near the prompt). In overlay mode we omit
  // both minHeight and flex-end: the parent is position=absolute with
  // bottom='100%', so its y is clamped to 0 by the renderer when it
  // would go negative. Adding minHeight + flex-end would create empty
  // padding rows that shift the visible items down into the prompt area
  // when the list has fewer items than maxVisibleItems.
  return (
    <Box flexDirection="column" justifyContent={overlay ? undefined : 'flex-end'}>
      {visibleItems.map(item => (
        <SuggestionItemRow key={item.id} item={item} isSelected={item.id === suggestions[selectedSuggestion]?.id} />
      ))}
    </Box>
  );
}

export default memo(PromptInputFooterSuggestions);
