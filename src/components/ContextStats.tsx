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
import { getDisplayPath } from '../utils/file.js';
import { formatTokens } from '../utils/format.js';
import { getSourceDisplayName } from '../utils/settings/constants.js';
import { Pane } from './design-system/Pane.js';

type Props = {
  data: ContextData;
  onClose: LocalJSXCommandOnDone;
};

type DetailSection = {
  title: string;
  hint?: string;
  items: Array<{ label: string; value: string }>;
};

const GRID_COLS = 10;
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
const DOT_COLORS: Record<string, string> = {
  gray: '#94A3B8',
  blue: '#38BDF8',
  green: '#34D399',
  yellow: '#FBBF24',
  magenta: '#EC4899',
  cyan: '#A78BFA',
  red: '#F87171',
};

function displayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name;
}

/** Build a grid row: N filled squares then (10-N) empty squares. */
function gridRow(filled: number): string {
  const cells: string[] = [];
  for (let i = 0; i < GRID_COLS; i++) {
    cells.push(i < filled ? '⛁' : '⬚');
  }
  return cells.join(' ');
}

export function ContextStats({ data, onClose }: Props): React.ReactNode {
  const [scrollOffset, setScrollOffset] = useState(0);

  const {
    categories,
    totalTokens,
    rawMaxTokens,
    percentage,
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
    () => categories.filter(c => c.tokens > 0 && c.name !== 'Free space' && c.name !== 'Autocompact buffer'),
    [categories],
  );

  // ── Build grid ──────────────────────────────────────────────
  const totalSquares = 100;
  const filledCount = Math.round((percentage / 100) * totalSquares);
  const fullRows = Math.floor(filledCount / GRID_COLS);
  const remainder = filledCount % GRID_COLS;

  const gridLines = useMemo(() => {
    const lines: string[] = [];
    for (let r = 0; r < 10; r++) {
      if (r < fullRows) {
        lines.push(gridRow(GRID_COLS));
      } else if (r === fullRows && remainder > 0) {
        lines.push(gridRow(remainder));
      } else {
        lines.push(gridRow(0));
      }
    }
    return lines;
  }, [fullRows, remainder]);

  // ── Right-side labels for each row ─────────────────────────
  const rowRightLabels = useMemo(() => {
    const labels: Array<{ text: string; color?: string } | null> = [];

    // Row 0: model info
    labels.push({
      text: `${model ?? ''} · ${formatTokens(totalTokens)}/${formatTokens(rawMaxTokens)} tokens (${percentage.toFixed(0)}%)`,
    });

    // Row 1-2: empty
    labels.push(null);
    labels.push(null);

    // Row 3+: categories with ⛁/⬚ prefix
    let catIdx = 0;
    for (let r = 3; r < 10; r++) {
      if (catIdx < usableCategories.length) {
        const cat = usableCategories[catIdx]!;
        const pct = rawMaxTokens > 0 ? ((cat.tokens / rawMaxTokens) * 100).toFixed(1) : '0';
        labels.push({
          text: `⛁ ${displayName(cat.name)}: ${formatTokens(cat.tokens)} tokens (${pct}%)`,
          color: cat.color,
        });
        catIdx++;
      } else {
        // Free space or empty
        const freeCat = categories.find(c => c.name === 'Free space');
        if (freeCat && freeCat.tokens > 0) {
          const pct = rawMaxTokens > 0 ? ((freeCat.tokens / rawMaxTokens) * 100).toFixed(1) : '0';
          labels.push({ text: `⬚ Free space: ${formatTokens(freeCat.tokens)} (${pct}%)` });
        } else {
          labels.push(null);
        }
        catIdx++;
      }
    }
    return labels;
  }, [model, totalTokens, rawMaxTokens, percentage, usableCategories, categories]);

  // ── Build detail sections ─────────────────────────────────
  const detailSections = useMemo((): DetailSection[] => {
    const sections: DetailSection[] = [];

    if (mcpTools.length > 0) {
      sections.push({
        title: 'MCP tools',
        hint: '/mcp',
        items: mcpTools.map(t => ({
          label: `${t.name} (${t.serverName})`,
          value: `${formatTokens(t.tokens)} tokens`,
        })),
      });
    }

    if (memoryFiles.length > 0) {
      sections.push({
        title: 'Memory files',
        hint: '/memory',
        items: memoryFiles.map(f => ({
          label: `${f.type === 'project' ? 'Project' : 'Global'} (${getDisplayPath(f.path)})`,
          value: `${formatTokens(f.tokens)} tokens`,
        })),
      });
    }

    if (systemPromptSections.length > 0) {
      sections.push({
        title: 'System prompt',
        items: systemPromptSections.map(s => ({
          label: s.name,
          value: `${formatTokens(s.tokens)} tokens`,
        })),
      });
    }

    const loadedSystem = systemTools.filter(t => !('isLoaded' in t) || (t as any).isLoaded);
    if (loadedSystem.length > 0) {
      sections.push({
        title: 'System tools',
        items: loadedSystem.map(t => ({
          label: t.name,
          value: `${formatTokens(t.tokens)} tokens`,
        })),
      });
    }

    if (agents.length > 0) {
      sections.push({
        title: 'Custom agents',
        items: agents.map(a => ({
          label: `[${getSourceDisplayName(a.source)}] ${a.agentType}`,
          value: `${formatTokens(a.tokens)} tokens`,
        })),
      });
    }

    if (skills && skills.tokens > 0) {
      sections.push({
        title: 'Skills',
        items: skills.skillFrontmatter.map(s => ({
          label: `[${getSourceDisplayName(s.source)}] ${s.name}`,
          value: `${formatTokens(s.tokens)} tokens`,
        })),
      });
    }

    if (messageBreakdown) {
      const items: Array<{ label: string; value: string }> = [
        { label: 'Assistant messages', value: formatTokens(messageBreakdown.assistantMessageTokens) },
        { label: 'Tool calls', value: formatTokens(messageBreakdown.toolCallTokens) },
        { label: 'Tool results', value: formatTokens(messageBreakdown.toolResultTokens) },
        { label: 'User messages', value: formatTokens(messageBreakdown.userMessageTokens) },
        { label: 'Attachments', value: formatTokens(messageBreakdown.attachmentTokens) },
      ];
      if (messageBreakdown.toolCallsByType.length > 0) {
        for (const t of messageBreakdown.toolCallsByType.slice(0, 5)) {
          items.push({ label: `  └ ${t.name}`, value: `${formatTokens(t.callTokens)} calls` });
        }
      }
      sections.push({ title: 'Conversation', items });
    }

    return sections;
  }, [mcpTools, memoryFiles, systemPromptSections, systemTools, agents, skills, messageBreakdown]);

  // ── Build flat detail rows for scrolling ──────────────────
  const detailRows = useMemo(() => {
    const rows: Array<{ type: 'section' | 'item' } & ({ title: string; hint?: string } | { label: string; value: string })> = [];
    for (const sec of detailSections) {
      rows.push({ type: 'section', title: sec.title, hint: sec.hint } as any);
      for (const item of sec.items) {
        rows.push({ type: 'item', ...item } as any);
      }
    }
    return rows;
  }, [detailSections]);

  const VISIBLE = 12;
  const maxScroll = Math.max(0, detailRows.length - VISIBLE);
  const visibleDetails = detailRows.slice(scrollOffset, scrollOffset + VISIBLE);

  useInput((input, key) => {
    if (key.escape || input === 'q' || (key.ctrl && (input === 'c' || input === 'd'))) {
      onClose('Context stats dismissed', { display: 'system' });
      return;
    }
    if (key.downArrow || input === 'j') setScrollOffset(prev => Math.min(prev + 1, maxScroll));
    if (key.upArrow || input === 'k') setScrollOffset(prev => Math.max(prev - 1, 0));
  });

  return (
    <Pane color="claude">
      <Box flexDirection="column" gap={0}>
        {/* Title */}
        <Box paddingLeft={2} marginBottom={0}>
          <Text bold color="claude">└ Context Usage</Text>
        </Box>

        {/* Grid rows */}
        <Box flexDirection="column" gap={0}>
          {gridLines.map((line, i) => {
            const rightLabel = rowRightLabels[i];
            return (
              <Box key={i} flexDirection="row" paddingLeft={2} gap={2}>
                <Text>{line}</Text>
                {rightLabel ? (
                  <Text dimColor={!rightLabel.color} color={rightLabel.color ? (DOT_COLORS[rightLabel.color] ?? rightLabel.color) : undefined}>
                    {rightLabel.text}
                  </Text>
                ) : null}
              </Box>
            );
          })}
        </Box>

        {/* Detail sections */}
        {detailRows.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {visibleDetails.map((row, i) => {
              if (row.type === 'section') {
                const s = row as any;
                const isFirst = s.title === detailSections[0]?.title;
                return (
                  <Box key={`s-${i}`} flexDirection="row" marginTop={isFirst ? 0 : 1}>
                    <Text bold>{s.title}</Text>
                    {s.hint ? <Text dimColor> · /{s.hint}</Text> : null}
                  </Box>
                );
              }
              const item = row as any;
              return (
                <Box key={`i-${i}`} flexDirection="row">
                  <Text dimColor> └ {item.label}: {item.value}</Text>
                </Box>
              );
            })}
          </Box>
        ) : null}

        {/* Footer */}
        <Box
          paddingLeft={1}
          marginTop={1}
          borderStyle="single"
          borderTop
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderColor="subtle"
        >
          <Box flexDirection="row" justifyContent="space-between" width="100%">
            <Text dimColor>
              Esc/q close · ↑↓/jk scroll
              {detailRows.length > VISIBLE ? ` · ${scrollOffset + 1}–${Math.min(scrollOffset + VISIBLE, detailRows.length)} of ${detailRows.length}` : ''}
            </Text>
          </Box>
        </Box>
      </Box>
    </Pane>
  );
}
