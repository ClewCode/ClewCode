// Context bar renderer — pure ANSI (no Ink/React). Produces a horizontal
// segmented bar where each color-coded segment represents a category's
// proportion of the total context window.

import ansis from 'ansis';

/** A single segment in the context bar */
export interface BarSegment {
  tokens: number;
  colorHex: string;
  label?: string;
}

/**
 * Maps theme color keys to hex values for the default dark theme.
 * Used by `/context` to render category-colored bars without Ink.
 */
export const THEME_COLOR_TO_HEX: Record<string, string> = {
  promptBorder: '#999999',
  inactive: '#666666',
  inactiveShimmer: '#8E8E8E',
  cyan_FOR_SUBAGENTS_ONLY: '#0891B2',
  permission: '#5769F7',
  claude: '#D77757',
  warning: '#966C1E',
  purple_FOR_SUBAGENTS_ONLY: '#9333EA',
  green_FOR_SUBAGENTS_ONLY: '#16A34A',
  blue_FOR_SUBAGENTS_ONLY: '#2563EB',
  red_FOR_SUBAGENTS_ONLY: '#DC2626',
  yellow_FOR_SUBAGENTS_ONLY: '#CA8A04',
  orange_FOR_SUBAGENTS_ONLY: '#EA580C',
  pink_FOR_SUBAGENTS_ONLY: '#DB2777',
};

const FREE_COLOR = '#2Mesh2A';

/**
 * Unicode block characters for fractional-width rendering.
 * Index = number of eighths filled (0..8).
 */
const FRACTIONS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

/**
 * Render a horizontal segmented bar using ANSI colors.
 *
 * @param segments  Ordered segments — each gets a proportional slice.
 * @param width     Total character width of the bar (default 20).
 * @returns         ANSI-colored string like "███▉██░░░░░░"
 */
export function renderSegmentedBar(segments: BarSegment[], width: number = 20): string {
  if (segments.length === 0) return ansis.dim('·').repeat(width);

  const totalTokens = segments.reduce((s, seg) => s + seg.tokens, 0);
  if (totalTokens <= 0) return ansis.dim('·'.repeat(width));

  const chars: string[] = [];
  let cursor = 0; // fractional position in [0, width)

  for (const seg of segments) {
    const end = cursor + (seg.tokens / totalTokens) * width;
    const startInt = Math.floor(cursor);
    const endInt = Math.floor(end);
    const frac = end - endInt; // fractional part [0, 1)

    // Fill full blocks
    const fullCount = endInt - startInt;
    for (let i = 0; i < fullCount; i++) {
      chars.push(ansis.hex(seg.colorHex)('█'));
    }

    // Partial block (if not already at an integer boundary)
    if (frac > 0.001 && endInt < width) {
      const fracIndex = Math.round(frac * 8);
      chars.push(ansis.hex(seg.colorHex)(FRACTIONS[Math.min(fracIndex, 8)]));
    }

    cursor = end;
  }

  // Pad remaining width with free space
  while (chars.length < width) {
    chars.push(ansis.hex(FREE_COLOR)('░'));
  }

  // Truncate if we overfilled (rounding can cause one extra char)
  if (chars.length > width) {
    // Remove last char — rounding overshoot
    chars.length = width;
  }

  return chars.join('');
}

/**
 * Render a compact 2-segment bar: used vs free. Used portion is colored
 * by usage level (teal → blue → amber → red).
 */
export function renderUsageBar(usedPct: number, width: number = 10): string {
  const safePct = Math.min(100, Math.max(0, usedPct));
  const filledWidth = (safePct / 100) * width;
  const fullBlocks = Math.floor(filledWidth);
  const frac = filledWidth - fullBlocks;

  let color: string;
  if (safePct > 90) color = '#FF0055';
  else if (safePct > 75) color = '#FFCC00';
  else if (safePct > 50) color = '#00CCFF';
  else color = '#00FFCC';

  const chars: string[] = [];
  for (let i = 0; i < fullBlocks; i++) {
    chars.push(ansis.hex(color)('█'));
  }
  if (fullBlocks < width) {
    const fi = Math.round(frac * 8);
    if (fi > 0) {
      chars.push(ansis.hex(color)(FRACTIONS[Math.min(fi, 8)]));
    }
    // pad remaining
    while (chars.length < width) {
      chars.push(ansis.hex(FREE_COLOR)('░'));
    }
  }

  return chars.join('');
}

/**
 * Synchronously estimate context token breakdown based on conversation messages.
 * Uses proportional scaling to ensure the sum of all categories matches totalTokens exactly.
 */
export function estimateContextBreakdown(
  messages: any[],
  totalTokens: number,
): Array<{ label: string; tokens: number; colorHex: string }> {
  // 1. Initial base estimates for static items
  let systemTokens = 8500;
  let toolsTokens = 5500;
  let rulesTokens = 1500;
  let conversationTokens = 0;
  let subagentsTokens = 0;

  // 2. Iterate through messages to compute relative dynamic sizes
  for (const msg of messages) {
    if (!msg) continue;
    // Check if the message is from or for a subagent
    const isSubagent =
      msg.type === 'subagent' ||
      typeof msg.agentType === 'string' ||
      typeof msg.agentName === 'string' ||
      (typeof msg.content === 'string' && msg.content.includes('[Agent]')) ||
      !!msg.parent_tool_use_id;

    // Sum character length to approximate tokens
    let charCount = 0;
    if (typeof msg.text === 'string') {
      charCount += msg.text.length;
    }
    if (typeof msg.content === 'string') {
      charCount += msg.content.length;
    } else if (msg.content && typeof msg.content === 'object') {
      try {
        charCount += JSON.stringify(msg.content).length;
      } catch {
        // ignore
      }
    }
    if (msg.message && typeof msg.message === 'object') {
      try {
        charCount += JSON.stringify(msg.message).length;
      } catch {
        // ignore
      }
    }

    const estimatedTokens = Math.max(10, Math.round(charCount / 4));

    if (isSubagent) {
      subagentsTokens += estimatedTokens;
    } else {
      conversationTokens += estimatedTokens;
    }
  }

  // Ensure minimum conversation tokens if there are messages
  if (conversationTokens === 0 && messages.length > 0) {
    conversationTokens = 1000;
  }

  // 3. Proportional scaling to match totalTokens exactly
  const sumEstimates = systemTokens + toolsTokens + rulesTokens + conversationTokens + subagentsTokens;
  if (sumEstimates > 0 && totalTokens > 0) {
    const scale = totalTokens / sumEstimates;
    systemTokens = Math.max(1, Math.round(systemTokens * scale));
    toolsTokens = Math.max(1, Math.round(toolsTokens * scale));
    rulesTokens = Math.max(1, Math.round(rulesTokens * scale));
    conversationTokens = Math.max(1, Math.round(conversationTokens * scale));
    subagentsTokens = Math.max(0, Math.round(subagentsTokens * scale));
  } else {
    // Fallback if no totalTokens or estimate
    return [{ label: 'System', tokens: totalTokens, colorHex: '#94A3B8' }];
  }

  // 4. Return formatted categories with premium TrueColor hex colors
  const results = [
    { label: 'System', tokens: systemTokens, colorHex: '#94A3B8' }, // Slate
    { label: 'Tools', tokens: toolsTokens, colorHex: '#38BDF8' }, // Sky Blue
    { label: 'Rules', tokens: rulesTokens, colorHex: '#34D399' }, // Emerald Green
  ];

  if (conversationTokens > 0) {
    results.push({ label: 'Chat', tokens: conversationTokens, colorHex: '#F87171' }); // Rose Red
  }

  if (subagentsTokens > 0) {
    results.push({ label: 'Agents', tokens: subagentsTokens, colorHex: '#A78BFA' }); // Purple
  }

  return results;
}
