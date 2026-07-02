/**
 * ContextStats — grid-layout context inspector.
 *
 * Shows a 10×10 usage grid (⛁⬚), model/token info, category listing,
 * and scrollable detail sections.
 */
import type React from 'react';
import { useMemo, useState } from 'react';
import { Box, Text, useInput } from '../ink.js';
import type { LocalJSXCommandOnDone } from '../types/command.js';
import type { ContextData } from '../utils/analyzeContext.js';
import { formatTokens } from '../utils/format.js';

type Props = {
  data: ContextData;
  onClose: LocalJSXCommandOnDone;
};

type DetailSection = {
  title: string;
  hint?: string;
  suffix?: string;
  items: Array<{ label: string; value: string }>;
};

type DetailRow =
  | { key: string; type: 'section'; title: string; hint?: string }
  | { key: string; type: 'item'; label: string; value: string };

const GRID_COLS = 10;
const RESERVED_CATEGORY_NAME = 'Autocompact buffer';
const MANUAL_COMPACT_BUFFER_NAME = 'Manual compact buffer';
const DISPLAY_NAMES: Record<string, string> = {
  'System prompt': 'System prompt',
  'System tools': 'Tools',
  '[ANT-ONLY] System tools': 'Tools',
  'MCP tools': 'MCP',
  'MCP tools (deferred)': 'MCP deferred',
  'System tools (deferred)': 'Tools deferred',
  'Custom agents': 'Subagents',
  'Memory files': 'Rules',
  Skills: 'Skills',
  Messages: 'Conversation',
};

function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name;
}

function modelDisplayName(model: string): string {
  const match = model.match(/(?:claude-)?(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (!match) return model;
  const [, family, major, minor] = match;
  return `${family[0]?.toUpperCase()}${family.slice(1)} ${major}.${minor}`;
}

function detailHint(hint: string): string {
  return hint.startsWith('/') ? hint : `/${hint}`;
}

type GridSquare = ContextData['gridRows'][number][number];

function squareSymbol(square: GridSquare): string {
  if (square.categoryName === 'Free space') return '⛶';
  if (square.categoryName === RESERVED_CATEGORY_NAME || square.categoryName === MANUAL_COMPACT_BUFFER_NAME) return '⛝';
  return square.squareFullness >= 0.7 ? '⛁' : '⛀';
}

export function ContextStats({ data, onClose }: Props): React.ReactNode {
  const [scrollOffset, setScrollOffset] = useState(0);

  const {
    categories,
    totalTokens,
    rawMaxTokens,
    percentage,
    gridRows,
    model,
    memoryFiles,
    mcpTools,
    systemTools = [],
    systemPromptSections = [],
    agents,
    skills,
    messageBreakdown,
  } = data;

  // ── Build usable categories (exclude free/compact buffer) ──
  const usableCategories = useMemo(
    () =>
      categories.filter(
        c =>
          c.tokens > 0 &&
          c.name !== 'Free space' &&
          c.name !== RESERVED_CATEGORY_NAME &&
          c.name !== MANUAL_COMPACT_BUFFER_NAME &&
          !c.isDeferred,
      ),
    [categories],
  );

  // ── Right-side labels for each row ─────────────────────────
  const rowRightLabels = useMemo(() => {
    const labels: Array<
      | { type: 'text'; text: string; dim?: boolean; italic?: boolean }
      | { type: 'category'; name: string; tokens: number; color: string }
      | { type: 'free'; tokens: number }
      | null
    > = [];

    labels.push({ type: 'text', text: modelDisplayName(model) });
    labels.push({ type: 'text', text: model });
    labels.push({
      type: 'text',
      text: `${formatTokens(totalTokens)}/${formatTokens(rawMaxTokens)} tokens (${percentage}%)`,
    });
    labels.push(null);
    labels.push({ type: 'text', text: 'Estimated usage by category', dim: true, italic: true });

    let catIdx = 0;
    for (let r = 5; r < gridRows.length; r++) {
      if (catIdx < usableCategories.length) {
        const cat = usableCategories[catIdx]!;
        labels.push({ type: 'category', name: cat.name, tokens: cat.tokens, color: cat.color });
        catIdx++;
      }
    }

    const freeCat = categories.find(c => c.name === 'Free space');
    if (freeCat && freeCat.tokens > 0 && labels.length < gridRows.length) {
      labels.push({ type: 'free', tokens: freeCat.tokens });
    }
    while (labels.length < gridRows.length) labels.push(null);

    return labels;
  }, [model, totalTokens, rawMaxTokens, percentage, usableCategories, categories, gridRows.length]);

  // ── Build detail sections ─────────────────────────────────
  const detailSections = useMemo((): DetailSection[] => {
    const sections: DetailSection[] = [];

    if (mcpTools.length > 0) {
      const total = mcpTools.reduce((sum, tool) => sum + tool.tokens, 0);
      const hasDeferred = mcpTools.some(tool => !tool.isLoaded);
      sections.push({
        title: 'MCP tools',
        hint: '/mcp',
        suffix: hasDeferred ? '(loaded on-demand)' : undefined,
        items: [{ label: `${mcpTools.length} tools`, value: `${formatTokens(total)} tokens` }],
      });
    }

    if (memoryFiles.length > 0) {
      const total = memoryFiles.reduce((sum, file) => sum + file.tokens, 0);
      sections.push({
        title: 'Memory files',
        hint: '/memory',
        items: [{ label: `${memoryFiles.length} files`, value: `${formatTokens(total)} tokens` }],
      });
    }

    if (systemPromptSections.length > 0) {
      const total = systemPromptSections.reduce((sum, section) => sum + section.tokens, 0);
      sections.push({
        title: 'System prompt',
        items: [{ label: `${systemPromptSections.length} sections`, value: `${formatTokens(total)} tokens` }],
      });
    }

    const loadedSystem = systemTools.filter(t => !('isLoaded' in t) || (t as any).isLoaded);
    if (loadedSystem.length > 0) {
      const total = loadedSystem.reduce((sum, tool) => sum + tool.tokens, 0);
      sections.push({
        title: 'System tools',
        items: [{ label: `${loadedSystem.length} tools`, value: `${formatTokens(total)} tokens` }],
      });
    }

    if (agents.length > 0) {
      const total = agents.reduce((sum, agent) => sum + agent.tokens, 0);
      sections.push({
        title: 'Custom agents',
        hint: '/agents',
        items: [{ label: `${agents.length} agents`, value: `${formatTokens(total)} tokens` }],
      });
    }

    if (skills && skills.tokens > 0) {
      const total = skills.skillFrontmatter.reduce((sum, skill) => sum + skill.tokens, 0);
      sections.push({
        title: 'Skills',
        hint: '/skills',
        items: [{ label: `${skills.skillFrontmatter.length} skills`, value: `${formatTokens(total)} tokens` }],
      });
    }

    if (messageBreakdown) {
      sections.push({
        title: 'Messages',
        items: [{ label: 'Current conversation', value: `${formatTokens(messageBreakdown.totalTokens)} tokens` }],
      });
    }

    return sections;
  }, [mcpTools, memoryFiles, systemPromptSections, systemTools, agents, skills, messageBreakdown]);

  const renderGridRows = useMemo(
    () =>
      gridRows.map((row, rowIndex) => ({
        key: `grid-row-${rowIndex}`,
        cells: row.map((square, colIndex) => ({
          key: `grid-cell-${rowIndex}-${colIndex}`,
          square,
        })),
      })),
    [gridRows],
  );

  // ── Build flat detail rows for scrolling ──────────────────
  const detailRows = useMemo(() => {
    const rows: DetailRow[] = [];
    for (const [sectionIndex, sec] of detailSections.entries()) {
      rows.push({
        key: `section-${sectionIndex}-${sec.title}`,
        type: 'section',
        title: sec.title,
        hint: [sec.hint, sec.suffix].filter(Boolean).join(' '),
      });
      for (const [itemIndex, item] of sec.items.entries()) {
        rows.push({
          key: `item-${sectionIndex}-${itemIndex}-${item.label}`,
          type: 'item',
          ...item,
        });
      }
    }
    return rows;
  }, [detailSections]);

  const VISIBLE = 12;
  const visibleDetails = detailRows.slice(scrollOffset, scrollOffset + VISIBLE);
  const canExpand = detailRows.length > VISIBLE;

  useInput((input, key) => {
    if (key.escape || input === 'q' || (key.ctrl && (input === 'c' || input === 'd'))) {
      onClose('Context stats dismissed', { display: 'system' });
      return;
    }
    const maxScroll = Math.max(0, detailRows.length - VISIBLE);
    if (key.downArrow || input === 'j') setScrollOffset(prev => Math.min(prev + 1, maxScroll));
    if (key.upArrow || input === 'k') setScrollOffset(prev => Math.max(prev - 1, 0));
  });

  return (
    <Box flexDirection="column" gap={0} paddingLeft={1}>
      {/* Title */}
      <Box paddingLeft={1} marginBottom={0}>
        <Text bold>└ Context Usage</Text>
      </Box>

      {/* Grid rows */}
      <Box flexDirection="column" gap={0}>
        {renderGridRows.map((row, i) => {
          const rightLabel = rowRightLabels[i];
          return (
            <Box key={row.key} flexDirection="row" paddingLeft={2} gap={2}>
              <Box
                flexDirection="row"
                flexShrink={0}
                width={gridRows[0]?.length ? gridRows[0].length * 2 : GRID_COLS * 2}
              >
                {row.cells.map(({ key, square }) => {
                  const isFree = square.categoryName === 'Free space';
                  return (
                    <Text key={key} color={isFree ? undefined : square.color} dimColor={isFree}>
                      {squareSymbol(square)}{' '}
                    </Text>
                  );
                })}
              </Box>
              {rightLabel?.type === 'text' ? (
                <Text dimColor={rightLabel.dim} italic={rightLabel.italic}>
                  {rightLabel.text}
                </Text>
              ) : rightLabel?.type === 'category' ? (
                <Box flexDirection="row">
                  <Text color={rightLabel.color}>⛁</Text>
                  <Text> {displayName(rightLabel.name)}: </Text>
                  <Text dimColor>
                    {formatTokens(rightLabel.tokens)} tokens (
                    {rawMaxTokens > 0 ? ((rightLabel.tokens / rawMaxTokens) * 100).toFixed(1) : '0.0'}%)
                  </Text>
                </Box>
              ) : rightLabel?.type === 'free' ? (
                <Box flexDirection="row">
                  <Text dimColor>⛶</Text>
                  <Text> Free space: </Text>
                  <Text dimColor>
                    {formatTokens(rightLabel.tokens)} (
                    {rawMaxTokens > 0 ? ((rightLabel.tokens / rawMaxTokens) * 100).toFixed(1) : '0.0'}%)
                  </Text>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>

      {/* Detail sections */}
      {detailRows.length > 0 ? (
        <Box flexDirection="column" marginTop={1} marginLeft={1}>
          {visibleDetails.map(row => {
            if (row.type === 'section') {
              const isFirst = row.title === detailSections[0]?.title;
              return (
                <Box key={row.key} flexDirection="row" marginTop={isFirst ? 0 : 1}>
                  <Text bold>{row.title}</Text>
                  {row.hint ? <Text dimColor> · {detailHint(row.hint)}</Text> : null}
                </Box>
              );
            }
            return (
              <Box key={row.key} flexDirection="row">
                <Text dimColor>
                  {' '}
                  └ {row.label}: {row.value}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {canExpand ? (
        <Box marginTop={1} marginLeft={1}>
          <Text dimColor>/context all to expand</Text>
        </Box>
      ) : null}
    </Box>
  );
}
