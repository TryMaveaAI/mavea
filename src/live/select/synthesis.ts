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

/** The `svgblock` escape hatch — the LAST resort when a visual genuinely can't be expressed by
 *  any component or composed layout (a molecule, a circuit, a geometric figure, a custom
 *  infographic). The model draws a small SVG and we sanitize it before render. The rules below
 *  MIRROR the sanitizer's whitelist (canvas/blocks/media/sanitizeSvg.ts), so following them keeps
 *  the drawing intact; anything outside them is silently stripped. Tier-agnostic — every model
 *  that is offered svgblock is taught it, with an explicit element list a small model can follow. */
export function svgBlockMenu(): string {
  return [
    'CUSTOM SVG — THE LAST RESORT. Before drawing one, walk this ladder IN ORDER and stop at the',
    'first that fits:',
    '  1) a purpose-built component (diagram, geometrycanvas, molecularstructure, vectorspace,',
    '     reactionmechanism, freebodydiagram, musicstaff, chart, timeline, …) — ALWAYS preferred;',
    '  2) a "composite" arranging real components, if it is only a layout you need;',
    '  3) ONLY if neither can represent the visual, draw it yourself with "svgblock".',
    'The right time for svgblock is a STRUCTURAL or CONCEPTUAL picture nothing above can render — a',
    'labelled apparatus, a geometric figure, a custom infographic, a symbol or logo. When such a',
    'visual genuinely helps the answer, DRAW IT rather than describing it in prose or dropping it.',
    'NEVER use svgblock for a CHEMICAL STRUCTURE — use the molecularstructure component (it draws',
    'real atoms and bonds); a hand-drawn molecule is always wrong. Likewise never use it to plot',
    'DATA or fake a chart — real numbers go in a real chart; an svgblock must never invent data.',
    'PREFER A COMPUTED PRIMITIVE for anything one can draw — molecularstructure from a SMILES string',
    '(it computes exact atom positions; never hand-place 30+ atoms), geometrycanvas from REAL',
    'coordinates (it auto-fits the axes), freebodydiagram for forces. They place the geometry FOR',
    'you, so they are always more accurate than drawing it by hand.',
    'Shape: {"type":"svgblock","props":{"title": string, "svg": string, "caption": string}}.',
    'CORRECTNESS BEFORE DETAIL — draw only facts you genuinely know from the user, grounded context,',
    'or stable knowledge. Never fill a visual gap with a plausible label, object, number, arrow, or',
    'relationship. Prefer a smaller, simpler figure over an impressive-looking guess. Before emitting',
    'it, cross-check that every label matches its shape, every arrow points in the correct direction,',
    'and the drawing agrees with its caption and the rest of the answer. Do not imply exact scale,',
    'position, chronology, causality, or completeness unless the evidence supports it; otherwise say',
    '"illustrative", "approximate", or "not to scale" in the caption. If accuracy is uncertain, use',
    'a purpose-built component or prose instead. These checks do not increase the output budget.',
    'ABSTRACT IDEAS ARE NOT LITERAL OBJECTS — never turn a proof, paradox, non-measurable set,',
    'invisible process, probability, or quantum effect into a concrete-looking mechanism. If a',
    'schematic still helps, label it "conceptual" and state exactly what it does NOT depict. Never',
    'draw ordinary-looking slices or arrows when the real mathematics or mechanism is not that.',
    'TOKEN & COMPLEXITY LIMIT — emit at most ONE svgblock in an answer. Keep its SVG at or below',
    '6,000 characters, 80 total elements, and 20 text labels. Spend those tokens on meaningful',
    'labels and relationships, not decorative paths. If that is insufficient, use a native block.',
    'RULES for "svg" (follow exactly — anything else is stripped on render):',
    '• A complete <svg> with a viewBox (e.g. viewBox="0 0 400 300") and NO width/height attributes.',
    '• Give it room: a truthful viewBox and only the elements + labels needed to explain the idea.',
    '• Colors: use ONLY these CSS variables — var(--presence), var(--insight), var(--warning),',
    '  var(--danger), var(--text-primary), var(--text-secondary), var(--text-muted),',
    '  var(--surface-card). NEVER hex, rgb(), or named colors — that is what keeps it on-brand',
    '  and correct in light AND dark mode.',
    '• Allowed elements ONLY: svg, g, defs, title, desc, path, rect, circle, ellipse, line,',
    '  polyline, polygon, text, tspan, linearGradient, radialGradient, stop, clipPath, mask,',
    '  pattern, marker, use (href="#id" only). Gradients are referenced as fill="url(#id)".',
    '• FORBIDDEN: <script>, <style>, <foreignObject>, <image>, <a>, event handlers (onclick…),',
    '  animation (<animate>/<set>), and ANY external URL or javascript:/data: reference.',
    '• Strokes and text use currentColor-style tokens; keep line weights consistent and legible.',
    '• Type must stay READABLE once the figure is scaled to fit a card. font-size is in viewBox',
    '  units, so it shrinks with everything else: keep every label at or above 1.5% of the',
    '  viewBox width (a 400-wide viewBox means font-size 6 at the very smallest, ~10 preferred).',
    '  A label nobody can read is worse than one you left out — drop the label or enlarge the',
    '  viewBox rather than shrinking type to make it fit.',
  ].join('\n');
}
