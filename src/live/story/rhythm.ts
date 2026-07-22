// rhythm.ts — visual cadence for a rich canvas.
//
// Two things already shape the canvas: the HARD CAPS in the system prompt limit text-heavy
// blocks (≤1 insight, ≤1 list, ≤2 breakdown), and the chosen arc (see ./arcs) orders the
// answer narratively. This adds the one rule they don't cover — CADENCE: never stack two
// text-heavy blocks back to back, and anchor the answer with a bold visual. It's a prompt
// directive (the model already knows which blocks read as text vs. visual), so it complements
// the arc without fighting its order or touching the layout pass.
//
// A per-component `textHeaviness` manifest + a deterministic post-hoc reorder are intentionally
// DEFERRED: the caps + the arc + this directive already cover the common case, and a reorder
// would have to fight the arc's deliberate verdict-first / action-last order. Revisit only if
// eval shows the directive isn't enough.

/** The visual-rhythm instruction, added to the prompt for rich asks only. */
export function rhythmDirective(): string {
  return (
    'VISUAL RHYTHM — alternate text-heavy blocks (insight, list, breakdown, a prose callout) with ' +
    'visual ones (a chart, ring, gauge, kpi, comparison, timeline); NEVER place two text-heavy ' +
    'blocks back to back. Anchor the answer with at least one bold visual near the top, and keep ' +
    'dense and light blocks interleaved so it reads as a designed spread, not a wall of cards.'
  );
}
