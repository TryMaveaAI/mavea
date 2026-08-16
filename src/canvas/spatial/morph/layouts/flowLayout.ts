// flowLayout.ts — the how-much representation. Causes on the left, the outcome on the right, and
// between them ribbons whose thickness is the share of the outcome each link actually explains.
//
// It answers the one question none of the other views can. The causal web shows that a cause is
// connected; the timeline shows when it happened; the chart shows what it measured on its own. None
// of them says which cause MATTERED, and that is usually the question behind the question.
//
// The honesty rule is the whole design. A ribbon's width is an edge's `weight`, which the grounding
// gate strips from any link that is not receipted — so this view draws only what was measured, and a
// cause whose links carry no measured share is held aside rather than drawn thin, which would read
// as "barely mattered" when the truth is "nobody measured it".
import type { Bbox } from '../../camera';
import type {
  ChromeSpec,
  LayoutFn,
  MorphLayout,
  MorphNodeDatum,
  PlacedNode,
  WorldData,
} from '../types';
import { CARD_H, CARD_SLOT_H, CARD_W, DEFAULT_VIEWPORT, PAD, px, relClass } from './lanes';
import { weightedIds } from './incidence';
import { placeShelf } from './shelf';

/** Horizontal pitch between one column of causes and the next. Wider than the graph's, because the
 *  ribbons between these columns are the content and need room to be read as areas. */
const COL_W = 340;
/** The most columns the flow will draw, however deep the web is.
 *
 *  A column per causal step is the obvious mapping and it is not what this view is FOR: it answers
 *  "how much did each cause matter", and depth is only the axis it happens to run along. A ten-step
 *  world spread one step per column is 3,400px wide, fits at 0.4×, and puts every label at 7.6px —
 *  a contribution view whose contributors cannot be read. Depth is banded into at most this many
 *  columns instead, which keeps the ribbons the widest thing on screen. */
const MAX_COLS = 4;
/** Vertical pitch inside a column. Clears the tallest a card can stand AT FULL COUNTER-SCALE, not
 *  its authored height — at CARD_H + 46 this was six pixels SHORT of the footprint and two cards in
 *  one column overlapped whenever the camera sat at the floor. */
const ROW_H = CARD_SLOT_H + 30;
/** A full-weight ribbon's stroke, in screen px. Ribbons are drawn as heavy strokes rather than as
 *  Sankey polygons: the stroke is `non-scaling-stroke`, so a ribbon stays the same weight on the
 *  glass as the camera moves, which a filled area would not. */
const RIBBON_MAX = 26;
/** …and the thinnest a measured ribbon may be drawn, so a real but small share is still visible as
 *  a ribbon rather than as a hairline indistinguishable from an unweighted link. */
const RIBBON_MIN = 3;

/** Does this node have a MEASURED share to show? Only a link the grounding gate left a weight on
 *  counts — an asserted link carries none, by contract. */
export function placeableOnFlow(node: MorphNodeDatum, world: WorldData): boolean {
  if (node.parentId !== undefined) return false;
  return weightedIds(world).has(node.id);
}

export const layoutFlow: LayoutFn = (world, opts) => {
  const viewport = opts?.viewport ?? DEFAULT_VIEWPORT;
  const top = world.nodes.filter((n) => n.parentId === undefined);
  const placed = top.filter((n) => placeableOnFlow(n, world));
  const shelved = top.filter((n) => !placeableOnFlow(n, world));
  const children = world.nodes.filter((n) => n.parentId !== undefined);

  const positions = new Map<string, PlacedNode>();
  const chrome: ChromeSpec = { bands: [], paths: [], labels: [] };
  const edgePaths: MorphLayout['edgePaths'] = [];

  const flowing = new Set(placed.map((n) => n.id));
  const ribbons = world.edges.filter(
    (e) =>
      e.from !== e.to && typeof e.weight === 'number' && flowing.has(e.from) && flowing.has(e.to),
  );

  // Columns by causal depth, normalised so the leftmost column sits at zero however the author
  // numbered them. Within a column the heaviest contributor leads: the eye should meet the ribbon
  // that explains most of the outcome first.
  const minDepth = placed.reduce((m, n) => Math.min(m, n.depth ?? 0), Infinity);
  const carries = new Map<string, number>();
  for (const e of ribbons) carries.set(e.from, (carries.get(e.from) ?? 0) + (e.weight ?? 0));

  const maxStep = placed.reduce(
    (m, n) => Math.max(m, Number.isFinite(minDepth) ? (n.depth ?? 0) - minDepth : 0),
    0,
  );
  /** A node's column: its causal step, banded so a deep world folds into MAX_COLS rather than
   *  stretching. A world shallower than the cap keeps one column per step exactly. */
  const columnOf = (node: MorphNodeDatum): number => {
    const step = Number.isFinite(minDepth) ? (node.depth ?? 0) - minDepth : 0;
    if (maxStep <= 0) return 0;
    if (maxStep < MAX_COLS) return step;
    return Math.round((step / maxStep) * (MAX_COLS - 1));
  };

  const byCol = new Map<number, MorphNodeDatum[]>();
  for (const node of placed) {
    const col = columnOf(node);
    const list = byCol.get(col);
    if (list) list.push(node);
    else byCol.set(col, [node]);
  }
  for (const list of byCol.values()) {
    list.sort(
      (a, b) => (carries.get(b.id) ?? 0) - (carries.get(a.id) ?? 0) || a.id.localeCompare(b.id),
    );
  }

  const tallest = Math.max(1, ...[...byCol.values()].map((l) => l.length));
  for (const [col, list] of byCol) {
    // Columns are centred against the tallest one, so a single outcome sits level with the middle
    // of the causes feeding it rather than pinned to the top corner.
    const offset = ((tallest - list.length) * ROW_H) / 2;
    list.forEach((node, i) => {
      positions.set(node.id, {
        x: PAD + col * COL_W,
        y: PAD + offset + i * ROW_H,
        w: CARD_W,
        h: CARD_H,
        face: 'card',
      });
    });
  }

  for (const e of ribbons) {
    const a = positions.get(e.from)!;
    const b = positions.get(e.to)!;
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const mid = (x1 + x2) / 2;
    const share = Math.min(1, Math.max(0, e.weight ?? 0));
    edgePaths.push({
      id: e.id,
      d: `M ${px(x1)} ${px(y1)} C ${px(mid)} ${px(y1)} ${px(mid)} ${px(y2)} ${px(x2)} ${px(y2)}`,
      className: 'morph-edge morph-ribbon' + relClass(e.kind),
      width: RIBBON_MIN + share * (RIBBON_MAX - RIBBON_MIN),
    });
  }

  for (const child of children) {
    const parent = child.parentId !== undefined ? positions.get(child.parentId) : undefined;
    const spot = parent ?? { x: PAD, y: PAD };
    positions.set(child.id, {
      x: spot.x,
      y: spot.y,
      w: CARD_W,
      h: CARD_H,
      face: 'card',
      folded: true,
    });
  }

  const cols = Math.max(1, ...[...byCol.keys()].map((c) => c + 1));
  const flowBbox: Bbox = {
    x: 0,
    y: 0,
    w: PAD * 2 + (cols - 1) * COL_W + CARD_W,
    h: PAD * 2 + tallest * ROW_H,
  };
  const shelf = placeShelf(
    shelved,
    flowBbox,
    `${shelved.length} with no measured share — the ribbons cannot size these`,
    viewport,
  );
  for (const [id, p] of shelf.positions) positions.set(id, p);
  if (shelf.band) chrome.bands.push(shelf.band);

  return { rep: 'flow', positions, edgePaths, chrome, bbox: shelf.bbox };
};
