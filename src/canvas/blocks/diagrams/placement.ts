// placement.ts — whether a diagram node's own coordinates can be believed.
//
// Every hand-placeable diagram contracts `x`/`y` as a 0..1 unit canvas and then clamps whatever
// it is given into that range. A model that answers on another scale — 0..100, or raw pixels —
// therefore had EVERY value clamped to 1, which stacked the whole figure on one point in the
// bottom-right corner: three labels piled inside a single ellipse over a card of empty space.
// Clamping turned an out-of-range number into a confidently wrong position instead of an
// unreadable one.
//
// Placement is an optional hint. A hint that cannot be read is worth less than the layout it
// displaced, so an unreadable one is dropped and the node is auto-placed — the figure the reader
// gets is always laid out, never piled.
//
// Shared rather than copied because the bug was: DiagramFlow and SysArchDiagram had the same
// four lines each, and fixing one would have left the other drawing the pile.

/** The shape both diagram families' nodes share, as far as placement is concerned. */
interface Placeable {
  id: string;
  x?: number;
  y?: number;
}

/** A coordinate on the 0..1 canvas the contract describes — not merely a finite number. */
function isUnitPoint(node: Placeable): boolean {
  const { x, y } = node;
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1
  );
}

/**
 * The ids whose own placement is worth honouring.
 *
 * Two or more authored points landing on the SAME spot are a pile rather than a layout, so that
 * set is dropped whole — the same judgement as the range check, one step further in. A single
 * authored point cannot collide with anything, so it is always kept.
 */
export function honouredPlacements(nodes: readonly Placeable[]): ReadonlySet<string> {
  const unit = nodes.filter(isUnitPoint);
  if (unit.length > 1) {
    const spots = new Set(
      unit.map((n) => `${Math.round((n.x as number) * 1e3)}:${Math.round((n.y as number) * 1e3)}`),
    );
    if (spots.size === 1) return new Set();
  }
  return new Set(unit.map((n) => n.id));
}
