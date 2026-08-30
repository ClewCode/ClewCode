/**
 * Goal chain parsing, shared by the Goal tool and the `/goal` slash command.
 *
 * A chained goal is written as `first then second then third`; the separator
 * is matched case-insensitively and must be surrounded by whitespace so a
 * goal mentioning "then" inside a word (or "authenticate") is unaffected.
 */

/**
 * Split a chained goal into its first goal and the remaining chain.
 * Returns null when the input names only a single goal.
 */
export function parseGoalChain(input: string): { first: string; chain: string[] } | null {
  const parts = input
    .split(/\s+then\s+/i)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0]!, chain: parts.slice(1) };
}
