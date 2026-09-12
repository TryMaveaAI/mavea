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
export interface Placeable {
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
 * The node INDICES whose own placement is worth honouring.
 *
 * Two or more authored points landing on the SAME spot are a pile rather than a layout, so that
 * set is dropped whole — the same judgement as the range check, one step further in. A single
 * authored point cannot collide with anything, so it is always kept.
 *
 * Indices, not ids: a model that repeats an id (or omits it) would otherwise honour one node's
 * coordinates for every node sharing that key — see ./layered for the same rule.
 */
export function honouredPlacements(nodes: readonly Placeable[]): ReadonlySet<number> {
  const unit = nodes.map((n, i) => [n, i] as const).filter(([n]) => isUnitPoint(n));
  if (unit.length > 1) {
    const spots = new Set(
      unit.map(
        ([n]) => `${Math.round((n.x as number) * 1e3)}:${Math.round((n.y as number) * 1e3)}`,
      ),
    );
    if (spots.size === 1) return new Set();
  }
  return new Set(unit.map(([, i]) => i));
}

/** How many bands a set of unit coordinates needs to sit clear of each other, given that a frame
 *  of N bands separates evenly-spread points by 1/N of its inner size. Bands closer together than
 *  one band's worth cannot be separated by a bigger frame — a figure that grew until they cleared
 *  would be a card of empty space around two touching nodes — so the answer is capped at what a
 *  full stack would need. */
function bandsNeeded(values: readonly number[]): number {
  const bands = [...new Set(values.map((v) => Math.round(v * 1e3)))].sort((a, b) => a - b);
  if (bands.length < 2) return bands.length;
  let closest = Infinity;
  for (let i = 1; i < bands.length; i++) closest = Math.min(closest, bands[i] - bands[i - 1]);
  return Math.min(values.length, Math.ceil(1e3 / closest));
}

/**
 * The rows and columns the honoured placements need for themselves — the frame a figure has to be
 * at least as big as before it draws them.
 *
 * A figure sizes its frame from the layout it planned, and an honoured node is by definition not
 * in that layout: it lands on the unit point it authored, inside a frame some other node's row
 * count chose. Nine placed nodes across three y bands in a two-row frame draw those bands 46
 * units apart against a node 46 units tall, so every band overlaps the next by half a node.
 *
 * Rows and columns count differently because the layouts place them differently: rows sit at
 * (r + 0.5)/rows of the inner height, so `rows` of them clear one node each, while columns sit
 * edge to edge at c/(columns - 1) of the inner width and take one more to do it.
 */
export function honouredSpread(
  nodes: readonly Placeable[],
  honoured: ReadonlySet<number>,
): { rows: number; columns: number } {
  const points = [...honoured].map((i) => nodes[i]).filter(Boolean);
  const columns = bandsNeeded(points.map((n) => n.x as number));
  return {
    rows: bandsNeeded(points.map((n) => n.y as number)),
    columns: columns > 1 ? columns + 1 : columns,
  };
}
