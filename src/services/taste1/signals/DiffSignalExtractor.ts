// Clew taste-1: Extract signal from diffs between before/after edits

export type DiffStats = {
  added: number;
  removed: number;
  totalBefore: number;
  totalAfter: number;
  changeRatio: number; // 0-1, proportion changed
};

/**
 * Compute edit distance ratio between two strings.
 * Uses simple line-level diff for speed (not token-level).
 */
export function computeEditDistance(before: string, after: string): DiffStats {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Count added/removed lines via simple set difference
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  let added = 0;
  let removed = 0;

  for (const line of afterLines) {
    if (!beforeSet.has(line)) added++;
  }
  for (const line of beforeLines) {
    if (!afterSet.has(line)) removed++;
  }

  const totalBefore = beforeLines.length;
  const totalAfter = afterLines.length;
  const total = Math.max(totalBefore, totalAfter, 1);
  const changeRatio = Math.min(1, (added + removed) / total);

  return { added, removed, totalBefore, totalAfter, changeRatio };
}

/**
 * Compute reward from edit distance stats.
 */
export function editDistanceReward(stats: DiffStats): number {
  if (stats.changeRatio <= 0.1) return 0.7; // tiny edit
  if (stats.changeRatio <= 0.4) return 0.2; // medium edit
  return -0.4; // heavy rewrite
}

/**
 * Extract a unified-diff-like string from before/after text.
 */
export function extractDiff(before: string, after: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const lines: string[] = [];

  let i = 0;
  let j = 0;
  while (i < beforeLines.length || j < afterLines.length) {
    if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
      lines.push(` ${beforeLines[i]}`);
      i++;
      j++;
    } else if (j < afterLines.length && (i >= beforeLines.length || beforeLines[i] !== afterLines[j])) {
      lines.push(`+${afterLines[j]}`);
      j++;
    } else if (i < beforeLines.length) {
      lines.push(`-${beforeLines[i]}`);
      i++;
    }
  }

  return lines.join('\n');
}
