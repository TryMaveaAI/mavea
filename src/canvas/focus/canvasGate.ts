// canvasGate.ts — the one structural predicate that decides whether an answer is "board-shaped"
// enough to be worth spreading onto the spatial Canvas view. It is the HARD gate for BOTH the
// header toggle and the Live "See this as a canvas" chip, so the chip can never offer a mode the
// canvas would refuse to render (no dead chip). Deliberately free of any `src/live` import so it
// stays in the eager landing bundle without dragging Live in; intent narrowing (planning/compare)
// lives in the Live footer, layered on top of this — it may narrow WHEN to nudge, never unlock it.
import type { Block, ConversationSpec } from '../../data/conversation';

/** A single answer needs at least this many distinct cards before a board reads as a board. */
export const CANVAS_MIN_CARDS = 4;
/** …and this much variety, so a flat list of the same tile doesn't qualify. */
export const CANVAS_MIN_TYPES = 3;

/** True when an answer is multi-faceted enough to be worth offering as a spatial board: several
 *  id-bearing cards with genuine variety. Any subject qualifies — a trip, a comparison, a plan, a
 *  breakdown, a decision — not just maps. Structural only (no model score, so it fires in the no-key
 *  Demo too) and side-effect free; the offer is still just a button the user can ignore. */
export function boardCapable(spec: Pick<ConversationSpec, 'blocks'> | null | undefined): boolean {
  const cards = (spec?.blocks ?? []).filter((b: Block) => !!b.id);
  return (
    cards.length >= CANVAS_MIN_CARDS && new Set(cards.map((b) => b.type)).size >= CANVAS_MIN_TYPES
  );
}
