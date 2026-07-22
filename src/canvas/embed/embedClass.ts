// embedClass — the single place that decides whether a block is rendered as its real self
// inside a static export (the PDF document, the slide deck), and how it must be fit.
//
// Both export paths normally flatten a block to a text/bar archetype; a small set of families
// exist *for* their bespoke visual (a Sankey, a state machine, a candlestick), and flattening
// them is exactly what makes the exports feel bare. Those route to a `figure` instead, which
// mounts the live component. This function is the join: the routing layer, the figure renderer,
// and the gauntlet tests all read it, so embeddability lives in one rule rather than three lists.
//
// Resolution order: an explicit per-type `embed` override on the catalog meta wins; an
// interactive control is never embedded; a `core` block keeps its already-designed archetype;
// otherwise the family default applies. Pure and dependency-light.
import type { EmbedKind } from '../blocks/catalog/meta';
import type { ComponentFacts } from '../blocks/catalog/facts';

export type { EmbedKind };

/**
 * Default embeddability per family. Only families whose whole point is an irreducible visual
 * are turned on; everything else stays on its designed archetype (`none`).
 *  - 'fluid' families render aspect-locked `viewBox` SVG that scales to any frame.
 *  - 'flow' families (code) grow by line count and are measured, not blindly scaled.
 * A per-type override (catalog `embed`) handles the exceptions inside a family — e.g. a Gantt
 * among the otherwise-fluid charts, which grows by row and must be measured.
 */
const FAMILY_DEFAULT: Readonly<Record<string, EmbedKind>> = {
  charts1: 'fluid', // Sankey, Treemap, Radar, Waterfall, Funnel, Venn… — all viewBox SVG
  charts2: 'fluid', // Bubble, Candlestick, Slopegraph, DotPlot… — viewBox SVG (Gantt overrides to flow)
  diagrams: 'fluid', // StateMachine, ER, Sequence, Circuit, MindShape… — viewBox SVG
  learn: 'fluid', // equations (KaTeX), wave/field/bode diagrams… (interactive ones excluded below)
  code: 'flow', // Shiki listings grow by line — measured, given a page when long
};

/** The embeddability class for a block, from its catalog metadata (undefined → not embeddable). */
export function embedClass(meta: ComponentFacts | undefined): EmbedKind {
  if (!meta) return 'none';
  if (meta.embed) return meta.embed; // explicit per-type override wins
  if (meta.interactive) return 'none'; // a control has no static affordance — never embed
  if (meta.family === 'core') return 'none'; // core blocks keep their designed archetype
  return FAMILY_DEFAULT[meta.family] ?? 'none';
}

/** Whether a block should be rendered as a real figure (either fit strategy) rather than flattened. */
export function isEmbeddable(meta: ComponentFacts | undefined): boolean {
  return embedClass(meta) !== 'none';
}
