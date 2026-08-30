/**
 * Shared Spinner types.
 *
 * `SpinnerMode` describes what the agent is currently doing, which drives the
 * spinner's glyph, verb and shimmer timing. Only `requesting` and `responding`
 * are set by the streaming pipeline today (see `setStreamMode` callers); the
 * remaining members are consumed by the rendering switches in `Spinner.tsx`
 * and `SpinnerAnimationRow.tsx`.
 */
export type SpinnerMode = 'idle' | 'loading' | 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use';

/**
 * An 8-bit-per-channel RGB triple, used for the shimmer/glimmer colour
 * interpolation in `utils.ts`. Distinct from `ink/styles.js`'s `RGBColor`,
 * which is the serialized `rgb(r,g,b)` string form.
 */
export type RGBColor = {
  r: number;
  g: number;
  b: number;
};
