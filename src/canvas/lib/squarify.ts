// Squarified treemap layout (Bruls, Huizing & van Wijk, 1999) — lays weighted items into a
// rectangle keeping each cell's aspect ratio close to 1:1, instead of the thin slivers a naive
// proportional slice/dice produces once values are skewed (a handful of large items next to
// many small ones, which is the common shape of real hierarchical data).

/** A hierarchy node shape wide enough to cover treemap/sunburst-style props. */
interface ValueNode {
  value: number;
  children?: ValueNode[];
}

export interface SquarifyRect<T> {
  node: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A node's rendered size: its own `value` when it's a leaf, or the sum of its descendants'
 * values when it has children. Lets a container node carry `value: 0` (or omit it) and size
 * itself entirely from what it contains, instead of every ancestor needing a hand-maintained
 * rollup — the gap that made a treemap with zero-value container nodes collapse to one box.
 */
export function effectiveValue(node: ValueNode): number {
  if (!node.children || !node.children.length) return Math.max(0, node.value);
  return node.children.reduce((sum, c) => sum + effectiveValue(c), 0);
}

/** Lay out `items` (sized by `effectiveValue`) into the rect (x, y, w, h), squarified. */
export function squarify<T extends ValueNode>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number,
): SquarifyRect<T>[] {
  const weighted = items
    .map((node) => ({ node, area: effectiveValue(node) }))
    .filter((it) => it.area > 0)
    .sort((a, b) => b.area - a.area);

  const total = weighted.reduce((s, it) => s + it.area, 0);
  if (!weighted.length || total <= 0 || w <= 0 || h <= 0) return [];

  const scale = (w * h) / total;
  const scaled = weighted.map((it) => ({ node: it.node, area: it.area * scale }));

  const out: SquarifyRect<T>[] = [];
  layoutRows(scaled, 0, x, y, w, h, out);
  return out;
}

/** How far from square a cell of `area` is when laid across a strip of `thickness`. */
function aspect(area: number, thickness: number): number {
  const side = area / thickness;
  return thickness > side ? thickness / side : side / thickness;
}

/**
 * Worst (largest) width:height ratio any cell in a row would have if laid across `length`.
 *
 * A row is fully described here by its total area and its smallest and largest item, rather than
 * the item list: the total alone fixes the strip's thickness, and against a fixed thickness a
 * cell's other side grows with its area — so the least-square cell is always one of the two
 * extremes and everything between them sits nearer 1:1. That's the form the row-growing scan in
 * `layoutRows` needs, since it can carry those three numbers forward as it admits items.
 */
function worstAspect(total: number, min: number, max: number, length: number): number {
  if (total <= 0 || length <= 0) return Infinity;
  const thickness = total / length;
  let worst = 1;
  const thinnest = aspect(min, thickness);
  if (thinnest > worst) worst = thinnest;
  const flattest = aspect(max, thickness);
  if (flattest > worst) worst = flattest;
  return worst;
}

/** Lay `items[from…]` into the rect, one row at a time, recursing into what's left over. */
function layoutRows<T>(
  items: { node: T; area: number }[],
  from: number,
  x: number,
  y: number,
  w: number,
  h: number,
  out: SquarifyRect<T>[],
): void {
  if (from >= items.length || w <= 0 || h <= 0) return;

  // Rows are laid out as a strip along the rectangle's shorter side, which keeps cells the
  // most square as the algorithm recurses into progressively thinner remainders.
  const stacked = w >= h;
  const length = stacked ? h : w;

  // Admit items into the row for as long as the next one leaves the row's worst cell no less
  // square than it already is. The row is always the run `items[from … end)`, so its total and
  // its extremes carry forward across the scan — testing a candidate then costs a couple of
  // divisions rather than another sweep over everything already admitted.
  const first = items[from].area;
  let total = first;
  let min = first;
  let max = first;
  let worst = worstAspect(total, min, max, length);
  let end = from + 1;
  for (; end < items.length; end++) {
    const { area } = items[end];
    const grownTotal = total + area;
    const grownMin = area < min ? area : min;
    const grownMax = area > max ? area : max;
    const grown = worstAspect(grownTotal, grownMin, grownMax, length);
    if (!(grown <= worst)) break;
    total = grownTotal;
    min = grownMin;
    max = grownMax;
    worst = grown;
  }

  const thickness = total / length;

  let offset = 0;
  for (let i = from; i < end; i++) {
    const it = items[i];
    const side = it.area / thickness;
    if (stacked) {
      out.push({ node: it.node, x, y: y + offset, w: thickness, h: side });
    } else {
      out.push({ node: it.node, x: x + offset, y, w: side, h: thickness });
    }
    offset += side;
  }

  if (end < items.length) {
    if (stacked) {
      layoutRows(items, end, x + thickness, y, w - thickness, h, out);
    } else {
      layoutRows(items, end, x, y + thickness, w, h - thickness, out);
    }
  }
}
