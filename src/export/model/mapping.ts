// Two-tier block → archetype routing.
//
// Tier 1: the ~30 load-bearing CORE block types route through an explicit table — they are
// the most common and want precise placement.
// Tier 2: every other (extended-library) type routes through the `DataShape` it already
// declares in the component catalog, which collapses ~260 types onto a handful of archetypes.
// Tier 3: anything still unrouted falls to `prose`, so no block is ever dropped silently.
import type { Block } from '../../data/conversation';
import type { DataShape } from '../../canvas/blocks/catalog/meta';
import { catalogFacts } from '../../canvas/blocks/catalog/facts';
import { embedClass } from '../../canvas/embed/embedClass';
import type { SectionKind } from './ExportDoc';

/** Explicit routing for the core block union (`data/conversation.ts`). */
export const CORE_ARCHETYPE: Record<string, SectionKind> = {
  insight: 'findingCallout',
  understand: 'findingCallout',
  chart: 'figureGrid',
  bars: 'figureGrid',
  ring: 'figureGrid',
  pipeline: 'figureGrid', // a funnel reads as a row of proportioned cells
  breakdown: 'distributionBars',
  stack: 'distributionBars',
  donut: 'distributionBars',
  list: 'rankedList',
  web: 'rankedList',
  gallery: 'rankedList',
  screenmap: 'rankedList',
  compare: 'ratingMatrix',
  heat: 'ratingMatrix',
  checklist: 'checklist',
  checks: 'checklist',
  buildprog: 'checklist',
  kpi: 'metricTiles',
  gauge: 'metricTiles',
  timeline: 'verticalTimeline',
  flow: 'numberedMilestones',
  scoreboard: 'specTable',
  standings: 'specTable',
  schema: 'specTable',
  quotes: 'spotlightCard', // a single pull-quote; multi-quote falls back to prose in the extractor
  // Lossy or non-visual in print: a heading + one honest line beats a broken widget screenshot.
  scatter: 'prose',
  codemap: 'prose',
  diff: 'prose',
  preview: 'prose',
};

/** Routing for the extended library, keyed by a component's primary declared `DataShape`.
 *  `null` marks shapes that are purely interactive and inert on paper — those blocks are dropped. */
export const DATASHAPE_ARCHETYPE: Record<DataShape, SectionKind | null> = {
  scalar: 'metricTiles',
  keyvalue: 'metricTiles',
  series: 'figureGrid',
  distribution: 'figureGrid',
  composition: 'distributionBars',
  comparison: 'ratingMatrix',
  ranking: 'rankedList',
  list: 'rankedList',
  sequence: 'verticalTimeline',
  flow: 'numberedMilestones',
  tabular: 'specTable',
  status: 'checklist',
  text: 'prose',
  code: 'prose',
  media: 'prose',
  geo: 'prose',
  relationship: 'prose',
  hierarchy: 'prose',
  structure: 'prose',
  selection: null,
  navigation: null,
  overlay: null,
  action: null,
};

/**
 * The archetype a block should render as, or `null` when the block is interactive-only and
 * has no place in a static document. Core types always resolve to an archetype.
 *
 * A block whose whole value is a bespoke visual (a Sankey, a state machine, a candlestick, a code
 * listing) routes to `figure` FIRST — it is rendered as its real component instead of being
 * flattened to text/bars, which is what made the rich families feel bare. `embedClass` decides this
 * from the catalog (family default + per-type override) and never embeds an interactive control.
 */
export function archetypeFor(block: Block): SectionKind | null {
  const meta = catalogFacts(block.type);
  if (embedClass(meta) !== 'none') return 'figure';
  const core = CORE_ARCHETYPE[block.type];
  if (core) return core;
  const shape = meta?.dataShapes[0];
  if (shape) {
    const mapped = DATASHAPE_ARCHETYPE[shape];
    // A shape we recognise but deliberately drop (interactive) → null; otherwise prose.
    return mapped === null ? null : (mapped ?? 'prose');
  }
  return 'prose';
}
