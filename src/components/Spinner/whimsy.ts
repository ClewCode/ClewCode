// Harry Potter-themed spinner phrases shown while the model works. Chosen
// deterministically from a per-turn seed so the phrase stays stable within a
// single turn but varies between turns; no Math.random, so it never flickers
// mid-render.
const WHIMSICAL_VERBS = [
  'Casting Accio',
  'Casting Lumos',
  'Casting Nox',
  'Casting Alohomora',
  'Casting Wingardium Leviosa',
  'Casting Expelliarmus',
  'Casting Expecto Patronum',
  'Transfiguring',
  'Apparating',
  'Disapparating',
  'Floo-traveling',
  'Portkeying',
  'Sorting',
  'Potion-brewing',
  'Quidditch-practicing',
  'Snitch-seeking',
  'Bludger-dodging',
  'Wand-polishing',
  'Spell-checking',
  'Pensieve-diving',
  'Marauder-mapping',
  'Mischief-managing',
  'Horcrux-hunting',
  'Hogsmeade-visiting',
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
