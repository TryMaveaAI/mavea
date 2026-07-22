// The block-type capability sets — a tiny, dependency-free leaf so the modules that only need to
// know "which block types is this tier allowed to emit" (the provider adapters' JSON schema, the
// eval scorer, the verifier) can import them WITHOUT pulling in liveSchema.ts, which reaches the
// full ~580-entry component catalog. Keeping these here is what lets a Live surface mount without
// parsing the whole catalog: the catalog is deferred to the first actual turn.
//
// liveSchema.ts re-exports all of these, so existing `from '../engine/liveSchema'` imports keep
// working; new code that only needs the sets should import from here.

/** The BASE block subset — what a small/local 3B model can fill reliably. */
export const ALLOWED_BLOCK_TYPES = new Set<string>([
  'insight',
  'chart',
  'breakdown',
  'list',
  'timeline',
  'compare',
  'kpi',
  'ring',
]);

/** The FRONTIER subset — base + close cousins a strong model fills reliably, for
 *  richer canvases. (The per-turn catalog selector exposes far more on top of this; this
 *  set is the static floor a strong model always gets.) */
export const FRONTIER_BLOCK_TYPES = new Set<string>([
  ...ALLOWED_BLOCK_TYPES,
  'bars', // grouped magnitudes (vs chart = over time)
  'stack', // one bar split into parts
  'donut', // composition as a ring
  'gauge', // a single value against a max (risk / score / readiness)
  'blanks', // "The Blank Space" — holes for values only the user can give (judgment call → frontier only)
]);

/** The 'photo' (real generated image) block is exposed ONLY when the user has turned
 *  image generation on — it's added to the allowed set per-turn, never by default. */
export const PHOTO_BLOCK_TYPE = 'photo';

/** Pick the exposed block set for a model's capability tier. */
export function blockTypesForTier(tier: 'frontier' | 'mid' | 'small'): ReadonlySet<string> {
  return tier === 'small' ? ALLOWED_BLOCK_TYPES : FRONTIER_BLOCK_TYPES;
}
