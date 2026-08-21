// graphLayout.ts — the causal-web representation, generalized from the why-machine's layout:
// columns by causal depth (roots left, outcome right), barycenter row ordering so edges cross as
// little as possible, all deterministic. Beyond layoutWhy it derives depth from edge topology when
// nodes don't carry one (and repairs one that contradicts its own edges, so a cause is never drawn
// to the right of what it explains), folds semantic-zoom children into their parent until
// expanded, and seeds re-layout from previous positions so an appended node doesn't reshuffle the
// web.
//
// A long chain also WRAPS. Seven causal depths in a row is a 2000px ribbon, and fitting a ribbon
// into a landscape viewport zooms it down until nothing on it can be read — so the columns break
// into stacked reading bands, left to right and then down, exactly like text, and a depth with
// more causes than a band is tall stands in two columns rather than running off the bottom. The
// break is spent only when it buys legibility: a composition that already fits at readable size is
// never cut, because a break costs the reader a jump.
//
// The composition is budgeted against the cards that will ACTUALLY be laid out, unfolded
// breakdowns included: an open card is a block that stands several rows tall and reaches past its
// own right edge, and a plan that counted it as one folded card handed the reader a web wider than
// the space it had measured.
import type { Bbox } from '../../camera';
import type {
  ChromeSpec,
  LayoutFn,
  LayoutOpts,
  MorphLayout,
  MorphNodeDatum,
  PlacedNode,
  WorldData,
} from '../types';
import { CARD_H, CARD_SLOT_H, CARD_W, DEFAULT_VIEWPORT, PAD, px, relClass } from './lanes';
import { separateRects, type SeparableRect } from './separate';

// COL_W/CARD_W (1.5) is also the ceiling on morph.css's counter-scale: a card may be blown up by
// at most that much before neighbouring columns touch.
const COL_W = 300; // > CARD_W → a 100px gutter between columns, whatever a label's length
const ROW_H = CARD_SLOT_H + 4; // clears the tallest card AT FULL COUNTER, with room to breathe
/** Gap kept between a card and whatever stands next to it. Also the floor the relaxation enforces
 *  between ANY two cards — so it, not a per-family pitch, is what actually sets how tall an open
 *  breakdown makes the web: a tighter sibling pitch is simply pushed back out to this.
 *
 *  4, down from 30, because the boxes it now separates are the cards' FULL-COUNTER footprints
 *  rather than their authored ones. The old pairing reserved 80-tall boxes 30 apart — a 110 pitch
 *  for a card that stands 112 tall at full counter, i.e. a gap of minus two — so the number looked
 *  generous and was not. 14 around a 112 box is a real gap and costs the composition less height
 *  than the old one pretended to — which matters, because the composition still has to fit a
 *  laptop at a legible scale (the gauntlet's "never produces a ribbon" contract) with a whole
 *  breakdown unfolded. It reads tighter than it is: the slot is the WORST case, reached only when
 *  the camera is at its floor, and at any ordinary zoom a card is well inside it. */
const CARD_GAP = 4;
/** Siblings in an open breakdown stack vertically, so their pitch has to clear the tallest a card
 *  can be, not the shortest — and match the gap the relaxation will enforce anyway. */
const CHILD_ROW_H = CARD_SLOT_H + CARD_GAP;
/** Air between two columns, whatever the blocks either side of it are worth. */
const GUTTER = COL_W - CARD_W;
/** How far right of its parent an unfolded breakdown stands. Clear of the parent's own card: at
 *  three quarters of a card width the middle child landed ON its parent, and the relaxation shoved
 *  the pair apart to exactly this offset anyway — but AFTER the composition had been budgeted,
 *  which is how an open breakdown used to grow the web past the size it had planned for. */
const CHILD_DX = CARD_W + CARD_GAP;
/** Air between two reading bands. The wrapped edge crosses back down the middle of it. */
const BAND_GAP = 96;
/** How far past the content a wrapped edge swings on its way down. Under PAD, so the return path
 *  stays inside the lane's own margin and never widens the bbox. */
const WRAP_SWING = 30;
/** How far a reading band's strip is drawn outside the cards it holds. */
const BAND_INSET = 20;
/** Space between two wrapped edges crossing the same gutter, so they run as lanes, not a braid. */
const WRAP_LANE = 18;
/** Space between two links attaching to the same side of one card. */
const EDGE_FAN = 15;
/** Widest a wrapped composition may end up. Past this it is a ribbon again, one band lower. */
const MAX_BAND_ASPECT = 2.5;
/** Below this camera scale the counter-scale (clamped at 1.4 in morph.css — keep the two in step)
 *  can no longer hold a card at its authored size, so the composition wraps rather than shrinks. */
const LEGIBLE_SCALE = 1 / 1.4;
/** Stroke weight (screen px) for a link with no measured contribution share, and the span a
 *  measured one is drawn across. Mirrors the why machine's weight→thickness reading. */
const EDGE_W_BASE = 1.7;
const EDGE_W_SPAN = 2.6;

interface Centre {
  x: number;
  y: number;
}

/** The composition, planned once and up front: how many columns go in a reading band, how tall a
 *  column may get before it splits, where each band sits, and where each depth's columns start. */
interface Composition {
  /** Columns per reading band. */
  perBand: number;
  /** Rows in each column, in reading order. */
  columnRows: number[];
  /** Left edge of each column's cards, relative to its band's own left edge. */
  columnX: number[];
  /** First column index of each depth. */
  startOf: Map<number, number>;
  /** Cards per column within each depth — the split of a bucket too tall to stand in one. */
  splitOf: Map<number, number>;
  /** Row-centre line of each band, in pre-offset lane coordinates. */
  centreY: number[];
  /** Height of each band's rows. */
  height: number[];
  /** Centre of the gutter BELOW band b. */
  gutterY: number[];
}

/** What a card occupies once its breakdown is open: the row-slots the block stands in, and how far
 *  past the card's own right edge it reaches. A folded card is one row and no reach. */
interface Block {
  rows: number;
  reach: number;
}

const FOLDED_BLOCK: Block = { rows: 1, reach: 0 };

/** What one causal depth asks of the composition. Its columns are planned before the barycenter
 *  pass has decided which card stands in which of them, so a column is budgeted for the tallest
 *  and widest blocks it COULD be handed — exact whenever the depth stands in one column, and never
 *  an under-estimate when it splits. With nothing expanded every block is 1×0 and this collapses
 *  to the card count the folded plan has always used. */
interface DepthMetrics {
  /** Cards in the depth. */
  size: number;
  /** Row-slots all of its blocks stand in. */
  rows: number;
  /** Row-slots of the k tallest blocks, k = 0…size — the ceiling on a column of k cards. */
  tallest: number[];
  /** Every block's reach, widest first: the depth's j-th column can hold at most the j-th. */
  reaches: number[];
}

function depthMetrics(
  cards: readonly MorphNodeDatum[],
  blockOf: (id: string) => Block,
): DepthMetrics {
  const spans = cards.map((n) => blockOf(n.id).rows).sort((a, b) => b - a);
  const reaches = cards.map((n) => blockOf(n.id).reach).sort((a, b) => b - a);
  const tallest = [0];
  let rows = 0;
  for (const span of spans) tallest.push((rows += span));
  return { size: cards.length, rows, tallest, reaches };
}

/** The columns a given band height implies, in reading order: how tall each stands, how wide it
 *  is, and how each depth's cards divide between the ones it was given. */
interface Columns {
  rows: number[];
  widths: number[];
  /** First column index of each depth, parallel to the metrics. */
  start: number[];
  /** Cards per column within each depth, parallel to the metrics. */
  per: number[];
}

function columnsFor(metrics: readonly DepthMetrics[], rowCap: number): Columns {
  const rows: number[] = [];
  const widths: number[] = [];
  const start: number[] = [];
  const per: number[] = [];
  for (const m of metrics) {
    // A block is atomic — it can never be torn across two columns — so a depth splits no further
    // than one column per card, however tall its blocks stand. The cards-per-column then decides
    // the split back, which is what keeps a tall, card-poor depth from asking for a column its
    // cards can never reach.
    const wanted = Math.max(1, Math.min(m.size, Math.ceil(m.rows / rowCap)));
    const cards = Math.ceil(m.size / wanted);
    const parts = Math.ceil(m.size / cards);
    start.push(rows.length);
    per.push(cards);
    for (let part = 0; part < parts; part++) {
      rows.push(m.tallest[Math.min(cards, m.size - part * cards)]);
      widths.push(CARD_W + (m.reaches[part] ?? 0));
    }
  }
  return { rows, widths, start, per };
}

/** Lay the columns out `perBand` at a time: each column's x inside its band, and each band's row
 *  count and width. Every column is at least a card wide, so the pitch is always its own width
 *  plus a gutter — a folded composition falls straight back out as a COL_W grid. */
function stackColumns(
  cols: Columns,
  perBand: number,
): { columnX: number[]; bandRows: number[]; bandW: number[] } {
  const columnX: number[] = [];
  const bandRows: number[] = [];
  const bandW: number[] = [];
  for (let col = 0; col < cols.rows.length; col++) {
    const band = Math.floor(col / perBand);
    const x = col % perBand === 0 ? 0 : columnX[col - 1] + cols.widths[col - 1] + GUTTER;
    columnX.push(x);
    bandRows[band] = Math.max(bandRows[band] ?? 1, cols.rows[col]);
    bandW[band] = Math.max(bandW[band] ?? 0, x + cols.widths[col]);
  }
  return { columnX, bandRows, bandW };
}

/** More bands than this and the reader is following a staircase, not an argument. A world that
 *  still does not fit takes the roomiest arrangement inside the limit and stays pannable. */
const MAX_BANDS = 12;

/** One candidate arrangement: `bands` reading bands, each column at most `rowCap` tall. */
interface Shape {
  bands: number;
  rowCap: number;
  perBand: number;
  fit: number;
  aspect: number;
}

/**
 * Choose the arrangement. Bands and column height are ONE decision, not two: more bands leaves
 * each band shorter, which splits tall depths into more columns, which needs more bands — so the
 * candidates are evaluated whole. An unbroken chain wins whenever it is legible at the scale it
 * would be fitted to, because a break costs the reader a jump; after that the fewest bands that
 * both fit and stay inside MAX_BAND_ASPECT win, and if nothing clears the floor the roomiest
 * arrangement does. Bounded candidates × one pass over the columns, so O(n).
 */
function chooseShape(metrics: readonly DepthMetrics[], vp: { w: number; h: number }): Shape {
  const shapeFor = (bands: number): Shape => {
    const band = (vp.h - (bands - 1) * BAND_GAP - PAD * 2) / bands;
    const rowCap = Math.max(2, Math.floor((band - CARD_H) / ROW_H) + 1);
    const cols = columnsFor(metrics, rowCap);
    const perBand = Math.max(1, Math.ceil(cols.rows.length / bands));
    const { bandRows, bandW } = stackColumns(cols, perBand);
    // The composition this candidate would actually produce: the widest band across, and the
    // bands' own heights stacked down. Measuring each band rather than charging every one of them
    // for the tallest column anywhere is what keeps a world with one deep breakdown in it from
    // reading as unfittable at every band count.
    let w = CARD_W;
    for (const width of bandW) w = Math.max(w, width);
    let h = (bands - 1) * BAND_GAP;
    for (let band = 0; band < bands; band++) h += ((bandRows[band] ?? 1) - 1) * ROW_H + CARD_H;
    return {
      bands,
      rowCap,
      perBand,
      fit: Math.min(vp.w / (w + PAD * 2), vp.h / (h + PAD * 2)),
      aspect: w / h,
    };
  };
  const unbroken = shapeFor(1);
  if (metrics.length < 2 || unbroken.fit >= LEGIBLE_SCALE) return unbroken;
  let best = unbroken;
  for (let bands = 2; bands <= MAX_BANDS; bands++) {
    const shape = shapeFor(bands);
    if (shape.fit >= LEGIBLE_SCALE && shape.aspect <= MAX_BAND_ASPECT) return shape;
    if (shape.fit > best.fit) best = shape;
    if (shape.perBand === 1) break; // nothing narrower left to try
  }
  return best;
}

function planComposition(
  depths: readonly number[],
  metrics: readonly DepthMetrics[],
  vp: { w: number; h: number },
): Composition {
  const shape = chooseShape(metrics, vp);
  const cols = columnsFor(metrics, shape.rowCap);
  const { columnX, bandRows } = stackColumns(cols, shape.perBand);

  const startOf = new Map<number, number>();
  const splitOf = new Map<number, number>();
  depths.forEach((d, i) => {
    startOf.set(d, cols.start[i]);
    splitOf.set(d, cols.per[i]);
  });

  // An empty world still gets one (empty) band, so every index below is a real one.
  const rows = bandRows.length > 0 ? bandRows : [1];
  const centreY: number[] = [];
  const height: number[] = [];
  const gutterY: number[] = [];
  let top = 0;
  for (const count of rows) {
    const h = (count - 1) * ROW_H + CARD_H;
    centreY.push(top + h / 2);
    height.push(h);
    top += h;
    gutterY.push(top + BAND_GAP / 2);
    top += BAND_GAP;
  }
  return {
    perBand: shape.perBand,
    columnRows: cols.rows,
    columnX,
    startOf,
    splitOf,
    centreY,
    height,
    gutterY,
  };
}

/** Depth per top-level node: the longest path from the roots where no depth is authored
 *  (everything starts at 0), and an authored `depth` honoured as far as its own edges allow.
 *
 *  A spec — hand-written or model-written — can name columns its edges contradict: a mechanism at
 *  depth 2 causing something the same spec put at depth 1, or a node called a root that other
 *  causes point INTO. Taken literally that drew the cause to the RIGHT of its effect, a backwards
 *  arrow doubling back across both cards, and left-to-right IS the reading order of a causal web.
 *  So an authored depth is pulled forward to its cause's column when an edge would otherwise run
 *  backwards — and no further: landing ON the cause's column is the shared-depth case the layout
 *  already reads as a vertical link, and pushing past it would break long chains of deliberately
 *  same-column steps into a ribbon nobody asked for. A derived depth still lands one column past
 *  its deepest cause, which is what makes columns out of a web with no depths at all.
 *
 *  A Kahn order settles every node one edge-sweep later, so the whole derivation is O(V + E); a
 *  cycle in model output leaves nodes the order can never release, and those fall back to a
 *  bounded relaxation — degraded columns, never a hang. */
function depthByTopology(topLevel: MorphNodeDatum[], world: WorldData): Map<string, number> {
  const depth = new Map<string, number>();
  const explicit = new Set<string>();
  for (const n of topLevel) {
    if (typeof n.depth === 'number' && Number.isFinite(n.depth)) {
      depth.set(n.id, n.depth);
      explicit.add(n.id);
    } else {
      depth.set(n.id, 0);
    }
  }
  const edges = world.edges.filter((e) => e.from !== e.to && depth.has(e.from) && depth.has(e.to));
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>(topLevel.map((n) => [n.id, 0]));
  for (const e of edges) {
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e.to]);
    else list.push(e.to);
    indegree.set(e.to, indegree.get(e.to)! + 1);
  }
  /** The column an effect may not sit left of: its cause's own, or one past it where the effect's
   *  depth is the layout's to derive. */
  const floorFor = (to: string, from: number): number => (explicit.has(to) ? from : from + 1);
  // Kahn's order, walked with a read head rather than shift() — shifting a queue of a thousand
  // ids is itself the quadratic this pass exists to remove. A node is released only once all its
  // predecessors have been, so relaxing along its out-edges at that moment IS the longest path.
  const queue = topLevel.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const settled = new Set<string>();
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    settled.add(id);
    const from = depth.get(id)!;
    for (const to of out.get(id) ?? []) {
      const floor = floorFor(to, from);
      if (floor > depth.get(to)!) depth.set(to, floor);
      const left = indegree.get(to)! - 1;
      indegree.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  if (settled.size < topLevel.length) {
    // Whatever the cycle holds back keeps the bounded relaxation, over just the edges that feed it
    // — an edge into a settled node is a no-op by then, since a settled node cannot have a
    // predecessor the order never released.
    const stuck = edges.filter((e) => !settled.has(e.to));
    for (let pass = topLevel.length; pass > 0; pass--) {
      let changed = false;
      for (const e of stuck) {
        const floor = floorFor(e.to, depth.get(e.from)!);
        if (floor > depth.get(e.to)!) {
          depth.set(e.to, floor);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  // The outcome reads rightmost even when a straggler edge would leave it mid-web — unless
  // something still hangs off it, in which case marching it to the last column would put it right
  // of its own effect and undo the repair above.
  const outcome = world.outcomeId;
  if (
    outcome !== undefined &&
    depth.has(outcome) &&
    !explicit.has(outcome) &&
    (out.get(outcome)?.length ?? 0) === 0
  ) {
    let deepest = -Infinity;
    for (const d of depth.values()) if (d > deepest) deepest = d;
    depth.set(outcome, deepest);
  }
  return depth;
}

/**
 * Where each card stands in its own depth's internal order: 0, unless other cards in the SAME
 * depth cause it, in which case one place after the last of them.
 *
 * A depth with more cards than a reading band is tall stands in two or three columns, and a
 * shared-depth link — the pair the layout draws top-to-bottom inside one column — then has its
 * ends in DIFFERENT columns. Ordered by barycenter alone the effect could take the earlier one,
 * putting its cause a column to the right and drawing the link backwards across the row. Sorting
 * by this rank first keeps a cause at or before its effect, so the pair either shares a column
 * (vertical, as intended) or reads left to right.
 *
 * Kahn over the depth's own links only, so O(cards + links), and the usual depth — no internal
 * links at all — returns a map of zeroes and leaves the barycenter order untouched. Cards inside a
 * same-depth cycle stay at 0 and order by barycenter: a ring has no reading order to preserve.
 */
function sameDepthOrder(
  cards: readonly MorphNodeDatum[],
  preds: ReadonlyMap<string, string[]>,
): Map<string, number> {
  const rank = new Map<string, number>(cards.map((n) => [n.id, 0]));
  const indegree = new Map<string, number>(cards.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>();
  let links = 0;
  for (const n of cards) {
    for (const from of preds.get(n.id) ?? []) {
      if (from === n.id || !rank.has(from)) continue; // a link from another depth: not ours to order
      const list = out.get(from);
      if (list === undefined) out.set(from, [n.id]);
      else list.push(n.id);
      indegree.set(n.id, indegree.get(n.id)! + 1);
      links++;
    }
  }
  if (links === 0) return rank;
  const queue = cards.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const r = rank.get(id)!;
    for (const to of out.get(id) ?? []) {
      if (r + 1 > rank.get(to)!) rank.set(to, r + 1);
      const remaining = indegree.get(to)! - 1;
      indegree.set(to, remaining);
      if (remaining === 0) queue.push(to);
    }
  }
  return rank;
}

/** Steps from each node up its parent chain to a top-level ancestor; null when the node IS
 *  top-level, or when its chain cycles — either way it is laid out as top-level rather than
 *  dropped. Every chain is walked once and memoised on the way back down, so the whole map costs
 *  O(n) however deep the nesting runs. */
function chainDepths(
  nodes: readonly MorphNodeDatum[],
  byId: ReadonlyMap<string, MorphNodeDatum>,
): Map<string, number | null> {
  const chain = new Map<string, number | null>();
  // Both a cycle and a top-level node answer `null`; only the walk needs to tell them apart, since
  // everything hanging below a cycle is itself unreachable from a top-level ancestor.
  const cyclic = new Set<string>();
  const path: MorphNodeDatum[] = [];
  const onPath = new Set<string>();
  for (const start of nodes) {
    if (chain.has(start.id)) continue;
    path.length = 0;
    onPath.clear();
    let cur = start;
    let base = 0;
    let inCycle = false;
    for (;;) {
      const parent = cur.parentId === undefined ? undefined : byId.get(cur.parentId);
      if (parent === undefined) {
        chain.set(cur.id, null); // a top-level ancestor: the path below it counts up from here
        break;
      }
      path.push(cur);
      onPath.add(cur.id);
      if (chain.has(parent.id)) {
        inCycle = cyclic.has(parent.id);
        base = chain.get(parent.id) ?? 0;
        break;
      }
      if (onPath.has(parent.id)) {
        inCycle = true;
        break;
      }
      cur = parent;
    }
    if (inCycle) {
      for (const node of path) {
        chain.set(node.id, null);
        cyclic.add(node.id);
      }
    } else {
      for (let i = path.length - 1; i >= 0; i--) chain.set(path[i].id, ++base);
    }
  }
  return chain;
}

function place(world: WorldData, opts: LayoutOpts | undefined): Omit<MorphLayout, 'rep'> {
  const byId = new Map(world.nodes.map((n) => [n.id, n]));
  const chain = chainDepths(world.nodes, byId);
  const topLevel = world.nodes.filter((n) => chain.get(n.id) === null);
  const children = world.nodes
    .filter((n) => chain.get(n.id) !== null)
    .sort((a, b) => chain.get(a.id)! - chain.get(b.id)! || a.id.localeCompare(b.id));
  const expanded = opts?.expandedIds;
  const previous = opts?.previous;

  const centre = new Map<string, Centre>();

  // Columns by depth, barycenter rows — the layoutWhy algorithm on the top-level web.
  const depth = depthByTopology(topLevel, world);
  const topIds = new Set(topLevel.map((n) => n.id));

  // Which breakdowns actually unfold, settled BEFORE the composition is planned: a child unfolds
  // only when its whole ancestor chain is expanded, and the plan has to budget for the cards it
  // will really lay out. `children` runs ancestor-first, so one pass decides them all.
  const unfolded = new Set<string>();
  for (const c of children) {
    const p = c.parentId!;
    if (expanded?.has(p) === true && (topIds.has(p) || unfolded.has(p))) unfolded.add(c.id);
  }
  // What each open card is worth, rolled up from the leaves — walking `children` backwards reaches
  // every node once its own breakdown has been summed.
  const blocks = new Map<string, Block>();
  const blockOf = (id: string): Block => blocks.get(id) ?? FOLDED_BLOCK;
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (!unfolded.has(child.id)) continue; // folded: it sits ON its parent and asks for nothing
    const own = blockOf(child.id);
    const parent = blocks.get(child.parentId!);
    blocks.set(child.parentId!, {
      rows: (parent?.rows ?? 0) + own.rows,
      reach: Math.max(parent?.reach ?? 0, CHILD_DX + own.reach),
    });
  }
  // Where each child stands inside its sibling stack, and how tall the stack is — banked here
  // because looking a child's row up with indexOf() while placing them is O(children²).
  const childRow = new Map<string, number>();
  const stackRows = new Map<string, number>();
  for (const c of children) {
    const filled = stackRows.get(c.parentId!) ?? 0;
    childRow.set(c.id, filled);
    stackRows.set(c.parentId!, filled + blockOf(c.id).rows);
  }

  const preds = new Map<string, string[]>();
  for (const e of world.edges) {
    if (!topIds.has(e.from) || !topIds.has(e.to)) continue;
    if (!preds.has(e.to)) preds.set(e.to, []);
    preds.get(e.to)!.push(e.from);
  }
  // Bucketed in one pass — re-filtering the whole web per column is O(columns × n).
  const byDepth = new Map<number, MorphNodeDatum[]>();
  for (const n of topLevel) {
    const d = depth.get(n.id)!;
    const bucket = byDepth.get(d);
    if (bucket === undefined) byDepth.set(d, [n]);
    else bucket.push(n);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const viewport = opts?.viewport ?? DEFAULT_VIEWPORT;
  const metrics = depths.map((d) => depthMetrics(byDepth.get(d)!, blockOf));
  const plan = planComposition(depths, metrics, viewport);
  // Which band each node reads in — the one thing an edge needs to know to route across a break.
  const bandOf = new Map<string, number>();
  for (const d of depths) {
    const cards = byDepth.get(d)!;
    const order = sameDepthOrder(cards, preds);
    const keyed = cards.map((n, i) => {
      const ps = (preds.get(n.id) ?? [])
        .map((p) => centre.get(p)?.y)
        .filter((v): v is number => v !== undefined);
      // Barycenter of already-placed predecessors; without one, the node's previous y keeps its
      // ordering stable across re-layouts, and only a brand-new root falls back to input order.
      const bary = ps.length
        ? ps.reduce((a, b) => a + b, 0) / ps.length
        : (previous?.get(n.id)?.y ?? i * ROW_H);
      return { n, bary, rank: order.get(n.id)! };
    });
    keyed.sort((a, b) => a.rank - b.rank || a.bary - b.bary || a.n.id.localeCompare(b.n.id));
    const start = plan.startOf.get(d)!;
    const perColumn = plan.splitOf.get(d)!;
    // Where each block starts inside its column and how tall the column ends up. A block is
    // atomic, so a column stands as tall as its blocks add up to — which is its card count exactly
    // whenever nothing in it is open, and the plan's budget for it at worst.
    const rowStart: number[] = [];
    const columnFill: number[] = [];
    keyed.forEach((k, i) => {
      const part = Math.floor(i / perColumn);
      rowStart.push(columnFill[part] ?? 0);
      columnFill[part] = (columnFill[part] ?? 0) + blockOf(k.n.id).rows;
    });
    keyed.forEach((k, i) => {
      const part = Math.floor(i / perColumn);
      const col = start + part;
      const band = Math.floor(col / plan.perBand);
      const span = blockOf(k.n.id).rows;
      bandOf.set(k.n.id, band);
      centre.set(k.n.id, {
        x: plan.columnX[col],
        y: plan.centreY[band] + (rowStart[i] + (span - 1) / 2 - (columnFill[part] - 1) / 2) * ROW_H,
      });
    });
  }

  // Children, nearest-ancestor-first so a parent always has a centre before its child needs one.
  // An unfolded child stands in the room its parent's column was budgeted for; anything else stays
  // folded ON its parent — present in the layout (never dropped), hidden under the parent's card.
  for (const node of children) {
    const parentId = node.parentId!;
    const parent = centre.get(parentId)!;
    bandOf.set(node.id, bandOf.get(parentId) ?? 0); // a breakdown reads in its parent's band
    if (unfolded.has(node.id)) {
      const span = blockOf(node.id).rows;
      const stack = stackRows.get(parentId)!;
      centre.set(node.id, {
        x: parent.x + CHILD_DX,
        y: parent.y + (childRow.get(node.id)! + (span - 1) / 2 - (stack - 1) / 2) * CHILD_ROW_H,
      });
    } else {
      centre.set(node.id, { x: parent.x, y: parent.y });
    }
  }

  // The composition reserves each open block its own room, so this is a safety net rather than the
  // mechanism: whatever the plan could only bound — a split depth that lands its tall blocks in one
  // column — is relaxed apart here. Folded children are excluded (they must stay exactly on their
  // parent) and re-snap to wherever the parent settled.
  if (unfolded.size > 0) {
    const movable = [...topLevel, ...children.filter((c) => unfolded.has(c.id))];
    const rects: SeparableRect[] = movable.map((n) => {
      const c = centre.get(n.id)!;
      // Separated by what a card can GROW to: relaxing 64px boxes leaves 118px cards overlapping.
      // Relaxed against the card's full-counter footprint, not its authored one — the gap this
      // enforces is only real if the boxes it separates are the size the cards can actually reach.
      return { x: c.x - CARD_W / 2, y: c.y - CARD_SLOT_H / 2, w: CARD_W, h: CARD_SLOT_H };
    });
    separateRects(rects, CARD_GAP);
    movable.forEach((n, i) => {
      centre.set(n.id, { x: rects[i].x + CARD_W / 2, y: rects[i].y + CARD_SLOT_H / 2 });
    });
    // Folded children re-snap to wherever their parent settled (in chain order, so a folded
    // grandchild follows a folded child that itself just moved).
    for (const node of children) {
      if (unfolded.has(node.id)) continue;
      const parent = centre.get(node.parentId!)!;
      centre.set(node.id, { x: parent.x, y: parent.y });
    }
  }

  // Shift into the lane's frame with PAD on every side.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of centre.values()) {
    minX = Math.min(minX, c.x - CARD_W / 2);
    minY = Math.min(minY, c.y - CARD_H / 2);
    maxX = Math.max(maxX, c.x + CARD_W / 2);
    maxY = Math.max(maxY, c.y + CARD_H / 2);
  }
  const empty = centre.size === 0;
  const offX = empty ? 0 : PAD - minX;
  const offY = empty ? 0 : PAD - minY;

  const positions = new Map<string, PlacedNode>();
  for (const n of world.nodes) {
    const c = centre.get(n.id)!;
    positions.set(n.id, {
      x: c.x + offX - CARD_W / 2,
      y: c.y + offY - CARD_H / 2,
      w: CARD_W,
      h: CARD_H,
      face: 'card',
      ...(chain.get(n.id) !== null && !unfolded.has(n.id) ? { folded: true } : {}),
    });
  }

  // Edges between visible cards only — a folded child's edges have nowhere honest to land.
  const visible = (id: string): boolean => topIds.has(id) || unfolded.has(id);
  const contentLeft = PAD;
  const contentRight = empty ? PAD : maxX + offX;
  /** Every link, with the route it needs decided up front — the counting passes below need to
   *  know which ones share a card's side and which share a gutter before any of them is drawn. */
  const drawn = world.edges
    .filter((e) => visible(e.from) && visible(e.to))
    .map((e) => {
      const from = positions.get(e.from)!;
      const to = positions.get(e.to)!;
      const fromBand = bandOf.get(e.from) ?? 0;
      const toBand = bandOf.get(e.to) ?? 0;
      // -1 when both ends read in the same band; otherwise the gutter the link has to cross.
      const gutter = fromBand === toBand ? -1 : Math.max(fromBand, toBand) - 1;
      // Two cards in one column (a shared depth), or a link running back up the chain: side to
      // side it would cut straight across both cards, so it connects them top to bottom instead —
      // which is also what the relationship looks like.
      const vertical = gutter < 0 && to.x <= from.x && Math.abs(to.y - from.y) > 1;
      return { e, from, to, gutter, vertical };
    });

  // Three counting passes, all O(edges): links sharing a gutter get their own lane across it, and
  // links sharing a card's side get their own seat on it, so nothing lands on top of anything.
  const crossings = new Map<number, number>();
  const arriving = new Map<string, number>();
  const leaving = new Map<string, number>();
  const bump = <K>(m: Map<K, number>, k: K): void => void m.set(k, (m.get(k) ?? 0) + 1);
  for (const link of drawn) {
    if (link.gutter >= 0) bump(crossings, link.gutter);
    if (link.vertical) continue;
    bump(arriving, link.e.to);
    bump(leaving, link.e.from);
  }
  const crossed = new Map<number, number>();
  const arrived = new Map<string, number>();
  const left = new Map<string, number>();
  /** Where on a card's side this link attaches: seats spread around the middle, never past it. */
  const seatY = (rect: PlacedNode, total: number, seat: number): number =>
    rect.y + rect.h / 2 + (seat - (total - 1) / 2) * Math.min(EDGE_FAN, rect.h / (total + 1));

  const edgePaths: MorphLayout['edgePaths'] = [];
  for (const { e, from, to, gutter, vertical } of drawn) {
    let d: string;
    if (vertical) {
      const cx1 = from.x + from.w / 2;
      const cx2 = to.x + to.w / 2;
      const down = to.y > from.y;
      const sy = down ? from.y + from.h : from.y;
      const ty = down ? to.y : to.y + to.h;
      const my = (sy + ty) / 2;
      d = `M ${px(cx1)} ${px(sy)} C ${px(cx1)} ${px(my)} ${px(cx2)} ${px(my)} ${px(cx2)} ${px(ty)}`;
    } else {
      const outSeat = left.get(e.from) ?? 0;
      const inSeat = arrived.get(e.to) ?? 0;
      left.set(e.from, outSeat + 1);
      arrived.set(e.to, inSeat + 1);
      const x1 = from.x + from.w;
      const y1 = seatY(from, leaving.get(e.from)!, outSeat);
      const x2 = to.x;
      const y2 = seatY(to, arriving.get(e.to)!, inSeat);
      if (gutter < 0) {
        const mx = (x1 + x2) / 2;
        d = `M ${px(x1)} ${px(y1)} C ${px(mx)} ${px(y1)} ${px(mx)} ${px(y2)} ${px(x2)} ${px(y2)}`;
      } else {
        // A wrapped link: out past the end of the band, back across the gutter, and into the next
        // band from its left — the shape the eye already follows at the end of a line of text.
        const total = crossings.get(gutter)!;
        const seat = crossed.get(gutter) ?? 0;
        crossed.set(gutter, seat + 1);
        const spread = Math.min(WRAP_LANE, (BAND_GAP - CARD_H / 2) / Math.max(1, total));
        const gy = plan.gutterY[gutter] + offY + (seat - (total - 1) / 2) * spread;
        const outX = contentRight + WRAP_SWING;
        const inX = Math.min(x2, contentLeft) - WRAP_SWING;
        const mid = (outX + inX) / 2;
        d =
          `M ${px(x1)} ${px(y1)} C ${px(outX)} ${px(y1)} ${px(outX)} ${px(gy)} ${px(mid)} ${px(gy)}` +
          ` C ${px(inX)} ${px(gy)} ${px(inX)} ${px(y2)} ${px(x2)} ${px(y2)}`;
      }
    }
    edgePaths.push({
      id: e.id,
      d,
      className:
        'morph-edge' +
        relClass(e.kind) +
        (e.sign === -1 ? ' morph-edge--damp' : '') +
        (e.provisional ? ' morph-edge--provisional' : '') +
        (gutter < 0 ? '' : ' morph-edge--wrap'),
      ...(typeof e.weight === 'number' && Number.isFinite(e.weight)
        ? { width: EDGE_W_BASE + Math.min(1, Math.max(0, e.weight)) * EDGE_W_SPAN }
        : {}),
    });
  }

  const bbox: Bbox = empty
    ? { x: 0, y: 0, w: PAD * 2, h: PAD * 2 }
    : { x: 0, y: 0, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 };

  // The reading bands themselves, once there is more than one — a quiet strip behind each says
  // "this row continues below" before the reader has traced a single arrow. Clamped into the bbox,
  // since a relaxed breakdown can push a card past its band's planned rows.
  const bands: ChromeSpec['bands'] =
    empty || plan.centreY.length < 2
      ? []
      : plan.centreY.map((cy, i) => {
          const top = Math.max(bbox.y, cy - plan.height[i] / 2 + offY - BAND_INSET);
          const bottom = Math.min(bbox.y + bbox.h, cy + plan.height[i] / 2 + offY + BAND_INSET);
          return {
            id: `reading-band:${i}`,
            x: contentLeft - BAND_INSET,
            y: top,
            w: contentRight - contentLeft + BAND_INSET * 2,
            h: Math.max(0, bottom - top),
            className: 'morph-reading-band',
          };
        });

  // …and ONE strip behind the whole composition, always. The reading bands appear only where a world
  // wraps onto a second row, so a three-to-six cause world — the common one — got no ground at all
  // and its cards floated on a flat panel. That is a large part of "it looks unfinished", and it is
  // the case a live answer is most often in. Emitted FIRST so it paints behind the reading bands,
  // and clamped into the bbox like them, so no fit changes.
  const ground: ChromeSpec['bands'] = empty
    ? []
    : [
        {
          id: 'causal-ground',
          x: contentLeft - BAND_INSET,
          y: bbox.y,
          w: contentRight - contentLeft + BAND_INSET * 2,
          h: bbox.h,
          className: 'morph-causal-ground',
        },
      ];

  return {
    positions,
    edgePaths,
    chrome: { bands: [...ground, ...bands], paths: [], labels: [] },
    bbox,
  };
}

/**
 * The honest floor, and the only unconditional one.
 *
 * The causal web places every node it is given and claims nothing the world did not: the reader
 * asked a causal question, and "what led to what" is the answer to it. It is `true` by CONTRACT
 * rather than by omission — the first-read fallback lands here, the walk's establishing shot names
 * it, and the chip row must never be empty. A corpus-wide test pins it so nobody tightens it later.
 *
 * A three-cause world with no drawn links is genuinely thin, but the cure for that is a richer world
 * and a better rail — never a refused graph. A surface that can offer nothing at all is worse than
 * one offering the only true reading it has.
 */
export const worthOnGraph = (): true => true;

export const layoutGraph: LayoutFn = (world, opts) => ({ rep: 'graph', ...place(world, opts) });
