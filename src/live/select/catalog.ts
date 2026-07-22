// catalog.ts — the in-memory index the Live selector retrieves over.
//
// The library is large and growing past a thousand components, so the selector must
// never scan everything or put everything in the prompt. This module loads the catalog
// once and builds the lookups that keep per-turn work proportional to MATCHES, not to
// library size: a type → meta map, and a data-shape → components inverted index. It
// also owns the two safety constants that make selection failure-proof — the base
// floor that is always offered, and the SAFE_SET fallback that mirrors today's
// behavior when detection or selection comes up empty.
import type { Archetype, ReliabilityTier } from '../../canvas/blocks/catalog/meta';
import {
  CATALOG_FACTS,
  catalogFacts,
  type ComponentFacts,
} from '../../canvas/blocks/catalog/facts';

/** A connected model's capability tier (mirrors ProviderCapabilities.strengthTier). */
export type ModelTier = 'frontier' | 'mid' | 'small';

/** The eight reliably-fillable base types — always offered so the model has a
 *  coercible floor no matter what the selector returns, and so a sparse answer can
 *  always fall back to a shape it fills well. */
export const BASE_FLOOR: readonly string[] = [
  'insight',
  'chart',
  'breakdown',
  'list',
  'timeline',
  'compare',
  'kpi',
  'ring',
];

/** The set used when shape detection or selection yields nothing usable: the base
 *  eight plus the four close cousins — every type with a hand-written, always-safe
 *  builder. Matching the pre-selector behavior keeps the worst case no worse than today. */
export const SAFE_SET: ReadonlySet<string> = new Set([
  ...BASE_FLOOR,
  'bars',
  'stack',
  'donut',
  'gauge',
]);

/** The GENERATIVE family — blocks where the model composes a novel figure on the fly
 *  (a freeform diagram now; model-designed composites/grids next). These are opt-in: when
 *  the user hasn't enabled on-the-fly creation they are excluded from the per-turn menu and
 *  schema entirely, so a paid model is never even told they exist (zero added token cost).
 *  Add a new generative type here and it's covered by the single toggle automatically. */
export const GENERATIVE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'diagramflow',
  'composite',
  'svgblock', // Tier-3: model synthesises raw SVG when no native block fits
]);

/** Types liveSchema can actually turn into a rendered block: the dozen with hand-written
 *  builders, plus every catalog entry the generic, metadata-driven coercer handles. The
 *  selector exposes ONLY these, so a model is never nudged toward a type that would be
 *  silently dropped (which would make the canvas SPARSER, not richer). A 'custom'-coercer
 *  type with no builder yet is intentionally excluded until it gets one. */
const HAND_BUILT: ReadonlySet<string> = new Set([
  ...BASE_FLOOR,
  'bars',
  'stack',
  'donut',
  'gauge',
  // custom-coercer types that DO have a hand-written builder in liveSchema (so the selector
  // may expose them — buildDiagramFlow / buildComposite):
  'diagramflow',
  'composite',
]);

/** Block types that FABRICATE spatial data — pins on a made-up grid (`map`/`markermap`) or hand-drawn
 *  region outlines that don't match real boundaries (`choropleth`). They were REMOVED from the library
 *  (a real answer must never present invented geography as if it were real — a real-world location
 *  belongs on `geomap` with real {lat,lng}; regional data on `bars`/`breakdown`). This denylist is the
 *  standing GUARD: it keeps these names out of `COERCIBLE_TYPES` so re-introducing one as a generic
 *  block can never make it Live-selectable without a deliberate review here. Honesty rule — see
 *  mavea-live-real-data-only. */
export const FAKE_DATA_TYPES: ReadonlySet<string> = new Set(['map', 'markermap', 'choropleth']);

export const COERCIBLE_TYPES: ReadonlySet<string> = new Set(
  CATALOG_FACTS.filter(
    (m) => (m.coercer === 'generic' || HAND_BUILT.has(m.type)) && !FAKE_DATA_TYPES.has(m.type),
  ).map((m) => m.type),
);

/** Which reliability tiers each model tier may be offered. Cutting components (nested /
 *  recursive props) are withheld from small local models; the per-turn budget K does the
 *  rest of the differentiation. */
const TIER_REACH: Record<ModelTier, ReadonlySet<ReliabilityTier>> = {
  small: new Set<ReliabilityTier>(['base', 'frontier']),
  mid: new Set<ReliabilityTier>(['base', 'frontier', 'cutting']),
  frontier: new Set<ReliabilityTier>(['base', 'frontier', 'cutting']),
};

/** The selection facts for a type — always resident, unlike the full `catalogMeta`. */
export function metaFor(type: string): ComponentFacts | undefined {
  return catalogFacts(type);
}

export function inReach(meta: ComponentFacts, tier: ModelTier): boolean {
  return TIER_REACH[tier].has(meta.tier);
}

/** Every catalog entry a model tier may use (the unfiltered pool, for vague asks). */
export function tierPool(tier: ModelTier): ComponentFacts[] {
  return CATALOG_FACTS.filter((meta) => inReach(meta, tier));
}

/** The canonical BASE type for each archetype — the coercible representative the selector offers
 *  (and teaches with its annotation options) when no fitting specialist of that archetype is
 *  available. Every base here is in COERCIBLE_TYPES so it can always render. `control`/`canvas`/
 *  `document`/`media` have no single base primitive, so they're absent (a specialist is offered
 *  directly or not at all). */
export const ARCHETYPE_BASE: Partial<Record<Archetype, string>> = {
  stat: 'kpi',
  trend: 'chart',
  bar: 'bars',
  composition: 'breakdown',
  distribution: 'bars',
  scatter: 'chart',
  matrix: 'breakdown',
  table: 'datatable',
  compare: 'compare',
  list: 'list',
  steps: 'list',
  timeline: 'timeline',
  graph: 'diagramflow',
  tree: 'breakdown',
  flow: 'diagramflow',
  map: 'geomap',
  prose: 'insight',
  code: 'codeblock',
};

/** The layout's span lookup, backed by the catalog — feeds adaptiveCols so every
 *  renderable type lays out with a sensible width and readable minimum. */
export function catalogSpan(type: string): { min: number; pref: number } | undefined {
  const meta = catalogFacts(type);
  if (!meta) return undefined;
  return {
    min: meta.colMin ?? Math.max(3, Math.round(meta.colDefault * 0.7)),
    pref: meta.colDefault,
  };
}
