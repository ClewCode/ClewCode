import Table from 'cli-table3';
import type { Token, Tokens } from 'marked';
import type React from 'react';
import stripAnsi from 'strip-ansi';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { stringWidth } from '../ink/stringWidth.js';
import { wrapAnsi } from '../ink/wrapAnsi.js';
import { Ansi, useTheme } from '../ink.js';
import type { CliHighlight } from '../utils/cliHighlight.js';
import { formatToken } from '../utils/markdown.js';

const SAFETY_MARGIN = 4;
const MIN_COLUMN_WIDTH = 10;
const MAX_ROW_LINES = 8;
const ANSI_BOLD_START = '\x1b[1m';
const ANSI_BOLD_END = '\x1b[22m';

type Props = {
  token: Tokens.Table;
  highlight: CliHighlight | null;
  /** Override terminal width (useful for testing) */
  forceWidth?: number;
};

export function MarkdownTable({ token, highlight, forceWidth }: Props): React.ReactNode {
  const [theme] = useTheme();
  const { columns: actualTerminalWidth } = useTerminalSize();
  const terminalWidth = forceWidth ?? actualTerminalWidth;

  // Format cell content to ANSI string
  function formatCell(tokens: Token[] | undefined): string {
    return tokens?.map(_ => formatToken(_, theme, 0, null, null, highlight)).join('') ?? '';
  }

  // Get plain text (stripped of ANSI codes)
  function getPlainText(tokens: Token[] | undefined): string {
    return stripAnsi(formatCell(tokens));
  }

  const numCols = token.header.length;
  if (numCols === 0) return null;

  // Border overhead: │ + (padding 2 + border 1) per col
  const borderOverhead = 1 + numCols * 3;
  const availableWidth = Math.max(terminalWidth - borderOverhead - SAFETY_MARGIN, numCols * MIN_COLUMN_WIDTH);

  // If available width is too cramped (< 15 chars per col), render clean vertical cards
  if (availableWidth < numCols * 15) {
    return <Ansi>{renderVerticalFormat()}</Ansi>;
  }

  // Calculate ideal and min widths for each column
  const minWidths = token.header.map((header, colIndex) => {
    let maxMinWidth = Math.max(stringWidth(getPlainText(header.tokens).split(/\s+/)[0] || ''), MIN_COLUMN_WIDTH);
    for (const row of token.rows) {
      const firstWord = getPlainText(row[colIndex]?.tokens).split(/\s+/)[0] || '';
      maxMinWidth = Math.max(maxMinWidth, stringWidth(firstWord), MIN_COLUMN_WIDTH);
    }
    return maxMinWidth;
  });

  const idealWidths = token.header.map((header, colIndex) => {
    let maxIdeal = Math.max(stringWidth(getPlainText(header.tokens)), MIN_COLUMN_WIDTH);
    for (const row of token.rows) {
      maxIdeal = Math.max(maxIdeal, stringWidth(getPlainText(row[colIndex]?.tokens)), MIN_COLUMN_WIDTH);
    }
    return maxIdeal;
  });

  const totalIdeal = idealWidths.reduce((sum, w) => sum + w, 0);
  const totalMin = minWidths.reduce((sum, w) => sum + w, 0);

  let columnWidths: number[];
  if (totalIdeal <= availableWidth) {
    columnWidths = idealWidths.map(w => w + 2); // +2 for cell padding
  } else if (totalMin <= availableWidth) {
    const extraSpace = availableWidth - totalMin;
    const overflows = idealWidths.map((ideal, i) => ideal - minWidths[i]!);
    const totalOverflow = overflows.reduce((sum, o) => sum + o, 0);
    columnWidths = minWidths.map((min, i) => {
      if (totalOverflow === 0) return min + 2;
      const extra = Math.floor((overflows[i]! / totalOverflow) * extraSpace);
      return min + extra + 2;
    });
  } else {
    // Proportional downscale
    const scaleFactor = availableWidth / totalMin;
    columnWidths = minWidths.map(w => Math.max(Math.floor(w * scaleFactor), MIN_COLUMN_WIDTH) + 2);
  }

  // Check if any row would wrap into excessively tall lines
  const wouldBeTooTall = token.rows.some(row =>
    row.some((cell, colIdx) => {
      const text = getPlainText(cell?.tokens);
      const width = (columnWidths[colIdx] ?? 20) - 2;
      return stringWidth(text) / Math.max(width, 10) > MAX_ROW_LINES;
    }),
  );

  if (wouldBeTooTall) {
    return <Ansi>{renderVerticalFormat()}</Ansi>;
  }

  // Render using cli-table3 with exact terminal constraints and Unicode borders
  const headers = token.header.map(h => formatCell(h.tokens));
  const table = new Table({
    head: headers,
    colWidths: columnWidths,
    wordWrap: true,
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
    style: {
      'padding-left': 1,
      'padding-right': 1,
      head: [],
      border: [],
    },
  });

  for (const row of token.rows) {
    table.push(row.map(cell => formatCell(cell?.tokens)));
  }

  return <Ansi>{table.toString()}</Ansi>;

  // Render vertical card format for very narrow terminals or tall rows
  function renderVerticalFormat(): string {
    const lines: string[] = [];
    const plainHeaders = token.header.map(h => getPlainText(h.tokens));
    const separatorWidth = Math.min(terminalWidth - 2, 45);
    const separator = '─'.repeat(separatorWidth);
    const wrapIndent = '  ';

    token.rows.forEach((row, rowIndex) => {
      if (rowIndex > 0) {
        lines.push(separator);
      }
      row.forEach((cell, colIndex) => {
        const label = plainHeaders[colIndex] || `Column ${colIndex + 1}`;
        const rawValue = formatCell(cell?.tokens).trimEnd();
        const value = rawValue.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

        const firstLineWidth = terminalWidth - stringWidth(label) - 3;
        const subsequentLineWidth = terminalWidth - wrapIndent.length - 2;

        const firstPassLines = wrapAnsi(value, Math.max(firstLineWidth, 10)).split('\n');
        const firstLine = firstPassLines[0] || '';
        let wrappedValue: string[];

        if (firstPassLines.length <= 1 || subsequentLineWidth <= firstLineWidth) {
          wrappedValue = firstPassLines;
        } else {
          const remainingText = firstPassLines
            .slice(1)
            .map(l => l.trim())
            .join(' ');
          const rewrapped = wrapAnsi(remainingText, subsequentLineWidth).split('\n');
          wrappedValue = [firstLine, ...rewrapped];
        }

        lines.push(`${ANSI_BOLD_START}${label}:${ANSI_BOLD_END} ${wrappedValue[0] || ''}`);
        for (let i = 1; i < wrappedValue.length; i++) {
          const line = wrappedValue[i]!;
          if (!line.trim()) continue;
          lines.push(`${wrapIndent}${line}`);
        }
      });
    });

    return lines.join('\n');
  }
}
