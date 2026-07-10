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
  'System tools': 'System tools',
  '[ANT-ONLY] System tools': 'System tools',
  'MCP tools': 'MCP tools',
  'MCP tools (deferred)': 'MCP deferred',
  'System tools (deferred)': 'System tools deferred',
  'Custom agents': 'Custom agents',
  'Memory files': 'Memory files',
  Skills: 'Skills',
  Messages: 'Messages',
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

  const { categories, totalTokens, rawMaxTokens, percentage, gridRows, model, memoryFiles, mcpTools, agents, skills } =
    data;

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

  const freeCategory = categories.find(c => c.name === 'Free space');

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

    if (agents.length > 0) {
      const total = agents.reduce((sum, agent) => sum + agent.tokens, 0);
      sections.push({
        title: 'Custom agents',
        hint: '/agents',
        items: [{ label: `${agents.length} agents`, value: `${formatTokens(total)} tokens` }],
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

    if (skills && skills.tokens > 0) {
      const total = skills.skillFrontmatter.reduce((sum, skill) => sum + skill.tokens, 0);
      sections.push({
        title: 'Skills',
        hint: '/skills',
        items: [{ label: `${skills.skillFrontmatter.length} skills`, value: `${formatTokens(total)} tokens` }],
      });
    }

    return sections;
  }, [mcpTools, memoryFiles, agents, skills]);

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

      {/* The legend is independent of the fixed-height grid so no category is clipped. */}
      <Box flexDirection="row" paddingLeft={2} gap={2}>
        <Box flexDirection="column" flexShrink={0} width={gridRows[0]?.length ? gridRows[0].length * 2 : GRID_COLS * 2}>
          {renderGridRows.map(row => (
            <Box key={row.key} flexDirection="row">
              {row.cells.map(({ key, square }) => {
                const isFree = square.categoryName === 'Free space';
                return (
                  <Text key={key} color={isFree ? undefined : square.color} dimColor={isFree}>
                    {squareSymbol(square)}{' '}
                  </Text>
                );
              })}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text>{modelDisplayName(model)}</Text>
          <Text dimColor>{model}</Text>
          <Text dimColor>{`${formatTokens(totalTokens)}/${formatTokens(rawMaxTokens)} tokens (${percentage}%)`}</Text>
          <Text> </Text>
          <Text dimColor italic>
            Estimated usage by category
          </Text>
          {usableCategories.map(category => (
            <Box key={category.name} flexDirection="row">
              <Text color={category.color}>⛁</Text>
              <Text> {displayName(category.name)}: </Text>
              <Text dimColor>
                {formatTokens(category.tokens)} tokens (
                {rawMaxTokens > 0 ? ((category.tokens / rawMaxTokens) * 100).toFixed(1) : '0.0'}%)
              </Text>
            </Box>
          ))}
          {freeCategory && freeCategory.tokens > 0 ? (
            <Box flexDirection="row">
              <Text dimColor>⛶</Text>
              <Text> Free space: </Text>
              <Text dimColor>
                {formatTokens(freeCategory.tokens)} (
                {rawMaxTokens > 0 ? ((freeCategory.tokens / rawMaxTokens) * 100).toFixed(1) : '0.0'}%)
              </Text>
            </Box>
          ) : null}
        </Box>
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
