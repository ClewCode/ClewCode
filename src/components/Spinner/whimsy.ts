// Whimsical present-participle verbs shown in the spinner while the model
// works (à la Claude Code's "Recombobulating…"). Chosen deterministically
// from a per-turn seed so the word stays stable within a single turn but
// varies between turns — no Math.random, so it never flickers mid-render.
const WHIMSICAL_VERBS = [
  'Recombobulating',
  'Frolicking',
  'Shimmying',
  'Percolating',
  'Ruminating',
  'Marinating',
  'Noodling',
  'Conjuring',
  'Finagling',
  'Cogitating',
  'Puttering',
  'Wrangling',
  'Tinkering',
  'Pondering',
  'Scheming',
  'Brewing',
  'Simmering',
  'Galivanting',
  'Bamboozling',
  'Discombobulating',
  'Effervescing',
  'Hornswoggling',
  'Meandering',
  'Spelunking',
] as const;

/**
 * Pick a whimsical verb from a numeric seed (typically the turn's
 * loadingStartTime). The `/1000` collapses sub-second jitter so the same
 * turn always maps to the same word; the modulo spreads turns across the
 * list. Falls back to 'Thinking' defensively.
 */
export function getWhimsicalVerb(seed: number): string {
  if (!Number.isFinite(seed)) return 'Thinking';
  const idx = Math.abs(Math.floor(seed / 1000)) % WHIMSICAL_VERBS.length;
  return WHIMSICAL_VERBS[idx] ?? 'Thinking';
}
