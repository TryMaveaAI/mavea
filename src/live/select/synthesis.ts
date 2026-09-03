// synthesis.ts — the "missing-UI detector".
//
// When no registered component clearly fits a substantive ask, let the model COMPOSE a bespoke
// layout from primitives (the `composite` block) instead of falling back to a wall of plain
// blocks. This is the one local, free signal that turns the otherwise-dormant composite
// compiler into fresh, designed-for-this-question UI — and it stays cheap by firing only on a
// weak fit, so the extra prompt tokens are paid in proportion to need. The model still makes
// the final call, and `composite` only ever arranges blocks that pass the full validator, so a
// synthesized layout can never be unsafe or off-brand.
import type { AskComplexity } from './complexity';
import type { ModelTier } from './catalog';
export { svgBlockMenu } from '../../engine/svgBlockPrompt';

/** The `composite` block — a titled grid of other blocks the model arranges on the fly. */
export const COMPOSITE_BLOCK_TYPE = 'composite';

/** Below this best-fit score, no catalog component maps cleanly to the ask, so we offer
 *  synthesis. `bestFit` now combines data-shape AND intent relevance, so < 0.5 means the question
 *  landed on neither a shape any component is built for NOR a clear user intent (reflect / decide /
 *  plan…) — a genuinely novel or cross-cutting ask ("what would a city built by cats be like").
 *  An intent-bearing ask ("is this friendship draining?") now anchors on real reflection components
 *  instead, which beats a generic synthesized layout. Conservative on purpose: synthesis costs a few
 *  prompt tokens and a little risk, so it should be the exception, not the default. Tunable by eval. */
export const SYNTH_FIT_FLOOR = 0.5;

/** Decide whether to offer on-the-fly composition for this turn. Pure, cheap, deterministic. */
export function shouldSynthesize(input: {
  complexity: AskComplexity;
  tier: ModelTier;
  bestFit: number;
  generativeOn: boolean;
}): boolean {
  // When the user has turned the generative family fully on, `composite` is already offered
  // every turn — the gap-gate is moot.
  if (input.generativeOn) return false;
  // Only a substantive ask deserves a bespoke layout; a trivial fact stays lean.
  if (input.complexity !== 'rich') return false;
  // A small local model can't reliably compose a nested layout — don't hand it the rope.
  if (input.tier === 'small') return false;
  return input.bestFit < SYNTH_FIT_FLOOR;
}

/** The rung BELOW composition. When the answer has ordinary structure — rows and columns, a series,
 *  parts of a whole — the right move is rarely a bespoke layout and never a new named component: it
 *  is a plain base carrying annotations. A receipt IS a table plus currency formatting and a
 *  computed total row. Teaching this is what keeps the library from having to grow a component for
 *  every phrasing of every ask: the bases already cover the forms, and the annotation grammar
 *  supplies the specificity. Emitted ahead of the composite menu so the model reaches for the cheap,
 *  reliable answer before the bespoke one.
 *
 *  `bases` are the annotation-capable block types actually on this turn's menu, so the prompt only
 *  ever advertises a field the renderer will honor — as more bases learn `annotations`, the rung
 *  widens on its own with no copy change. */
export function annotateMenu(bases: readonly string[]): string {
  return [
    `ANNOTATE THE BASE — ${bases.join(', ')} accept an "annotations" array, and using it is how a`,
    'plain block becomes the specific thing the user asked for: a table of line items annotated with',
    'currency formatting and a total row IS a receipt; the same table with a status color on the',
    'overdue rows IS an aging report. Prefer annotating a base over inventing a layout or dropping to',
    'prose. Every annotation must refer to data that is actually in the block (a real column key, a',
    "real row label) and describe the answer's real values — anything else is dropped on render.",
  ].join('\n');
}

/** The prompt block that teaches `composite` and invites composition when nothing fits. Added
 *  to the system prompt only on a turn where `shouldSynthesize` is true. */
export function synthesisMenu(): string {
  return [
    'COMPOSE A CUSTOM LAYOUT IF NOTHING FITS — none of the components above map cleanly to this',
    'answer, so you MAY build a bespoke one with "composite": a titled grid of 2 or more other',
    'blocks. Shape: {"type":"composite","props":{"title": string, "regions":[{"block": <a normal',
    'block object>, "span": 1-12}, …]}}. Each region\'s "block" is an ordinary block (insight, kpi,',
    'compare, breakdown, ring, timeline, …) and "span" is its width on a 12-column row. Use it to',
    'assemble a fresh, on-brand layout — a hero card beside a few metric tiles, scenario cards over',
    'a checklist — rather than a wall of plain text. Build it from the RICH blocks; never nest a',
    'composite inside a composite.',
  ].join('\n');
}
