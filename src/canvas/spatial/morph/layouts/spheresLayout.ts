// spheresLayout.ts — the what-kind-of-force representation.
//
// "What kinds of force is this made of, and where does the explanation hand off from one to
// another?" Causes are laid into one lane per sphere, and the CONTENT of the view is the crossings:
// a link that changes lane is a handoff between kinds of force, drawn at full weight, while a link
// that stays inside one lane goes faint.
//
// It passes the test that cut orbit, spine and matrix, and the test is worth restating because it is
// easy to fail: those three were cut because their organising channel was ALREADY the graph's
// geometry — causal distance is the graph's x, topological order is its ordering, adjacency is its
// edges. Domain is not. It is a 6px dot in a card's foot. And the graph's y means nothing at all
// (barycentre ordering, to minimise crossings), so this replaces a meaningless axis with a
// meaningful one and takes no channel away. The graph draws no sphere boundary, so it cannot show a
// crossing even in principle.
import type { Bbox } from '../../camera';
import type {
  ChromeSpec,
  LayoutFn,
  MorphLayout,
  MorphNodeDatum,
  PlacedNode,
  WorldData,
} from '../types';
import {
  CARD_H,
  CARD_SLOT_H,
  CARD_W,
  DEFAULT_VIEWPORT,
  PAD,
  modClass,
  px,
  relClass,
} from './lanes';
import { foldOnto, splitByFold } from './nesting';
import { placeShelf } from './shelf';

/** The same column pitch the causal web uses, so graph → spheres SLIDES sideways rather than
 *  scattering: a cause keeps its causal step and only changes lane. */
const COL_W = 300;
const LANE_PAD = 18;
const LANE_GAP = 20;
/** A deep world folds into this many columns rather than running off sideways.
 *
 *  The lanes are short and wide by construction — one row per sphere — so a composition that laid a
 *  ten-step chain out at full pitch came out ~2,700 units across and a couple of hundred tall, and
 *  the camera fitting that produced a thin, illegible strip. The causal step still ORDERS the causes
 *  left to right, which is the reading direction the graph taught; past this many steps it is banded
 *  rather than spaced, exactly as the contribution view bands its own columns. */
const MAX_COLS = 4;
/** One sphere is not a partition. */
const MIN_SPHERES = 2;

/** Every sphere present among the top-level causes. */
function spheresOf(world: WorldData): Set<string> {
  const out = new Set<string>();
  for (const n of world.nodes) {
    if (n.parentId === undefined && n.domain !== undefined) out.add(n.domain);
  }
  return out;
}

/** Can this view place the node in a lane? It needs a sphere to be in, and the world needs at least
 *  two of them for a lane to mean anything. */
export function placeableOnSpheres(node: MorphNodeDatum, world: WorldData): boolean {
  if (node.parentId !== undefined) return false;
  if (node.domain === undefined) return false;
  return spheresOf(world).size >= MIN_SPHERES;
}

/**
 * Does this world HAND OFF between spheres?
 *
 * The lanes are the arrangement; the crossings are the content. A world whose every link stays
 * inside one lane is the causal web with its rows re-sorted, which is precisely what orbit, spine
 * and matrix were cut for — so the offer asks for a crossing, not merely for spheres.
 *
 * Deliberately silent about how EVENLY the world splits. Eight economy, two policy and two society
 * carries nine crossings and reads well; evenness belongs to the ranking, not to whether the picture
 * exists at all.
 */
export function worthOnSpheres(world: WorldData): boolean {
  const domainOf = new Map<string, string>();
  for (const n of world.nodes) {
    if (n.parentId === undefined && n.domain !== undefined) domainOf.set(n.id, n.domain);
  }
  if (new Set(domainOf.values()).size < MIN_SPHERES) return false;
  for (const e of world.edges) {
    const a = domainOf.get(e.from);
    const b = domainOf.get(e.to);
    if (a !== undefined && b !== undefined && a !== b) return true;
  }
  return false;
}

export const layoutSpheres: LayoutFn = (world, opts) => {
  const viewport = opts?.viewport ?? DEFAULT_VIEWPORT;
  const { drawn, folded } = splitByFold(world, opts?.expandedIds);
  const placed = drawn.filter((n) => placeableOnSpheres(n, world));
  const shelved = drawn.filter((n) => n.parentId === undefined && !placeableOnSpheres(n, world));

  const positions = new Map<string, PlacedNode>();
  const chrome: ChromeSpec = { bands: [], paths: [], labels: [] };
  const edgePaths: MorphLayout['edgePaths'] = [];

  // x stays the causal step, normalised — the reading direction the graph taught, kept.
  const minDepth = placed.reduce((m, n) => Math.min(m, n.depth ?? 0), Infinity);
  const stepOf = (n: MorphNodeDatum): number =>
    Number.isFinite(minDepth) ? Math.max(0, (n.depth ?? 0) - minDepth) : 0;
  const maxStep = placed.reduce((m, n) => Math.max(m, stepOf(n)), 0);
  const columnOf = (n: MorphNodeDatum): number => {
    const step = stepOf(n);
    if (maxStep <= 0) return 0;
    return maxStep < MAX_COLS ? step : Math.round((step / maxStep) * (MAX_COLS - 1));
  };
  const contentW = PAD * 2 + Math.min(maxStep, MAX_COLS - 1) * COL_W + CARD_W;

  const byDomain = new Map<string, MorphNodeDatum[]>();
  for (const n of placed) {
    const list = byDomain.get(n.domain!);
    if (list) list.push(n);
    else byDomain.set(n.domain!, [n]);
  }
  // Fullest sphere first, ties by name, so one world always lays out one way.
  const lanes = [...byDomain].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));

  const laneOf = new Map<string, number>();
  let y = PAD;
  lanes.forEach(([domain, members], laneIndex) => {
    for (const n of members) laneOf.set(n.id, laneIndex);
    const byStep = new Map<number, MorphNodeDatum[]>();
    for (const n of [...members].sort((a, b) => stepOf(a) - stepOf(b) || (a.id < b.id ? -1 : 1))) {
      const col = byStep.get(columnOf(n));
      if (col) col.push(n);
      else byStep.set(columnOf(n), [n]);
    }
    const rows = [...byStep.values()].reduce((m, c) => Math.max(m, c.length), 1);
    const laneH = rows * CARD_SLOT_H + LANE_PAD * 2;
    for (const [column, col] of byStep) {
      col.forEach((n, i) => {
        positions.set(n.id, {
          x: PAD + column * COL_W,
          // Pitched on the FULL-COUNTER slot, never on the authored height: the counter-scale blows
          // a card up as the camera pulls back, so reserving CARD_H would let two cards touch.
          y: y + LANE_PAD + i * CARD_SLOT_H + (CARD_SLOT_H - CARD_H) / 2,
          w: CARD_W,
          h: CARD_H,
          face: 'card',
        });
      });
    }
    chrome.bands.push({
      id: `sphere:${domain}`,
      x: 0,
      y,
      w: contentW,
      h: laneH,
      className: `morph-sphere${modClass('morph-sphere', domain)}`,
      label: `${domain} · ${members.length}`,
    });
    y += laneH + LANE_GAP;
  });

  // The content of this view: links that leave one sphere and enter another.
  for (const e of world.edges) {
    if (e.from === e.to) continue;
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    // An edge touching a shelved cause would assert a sphere that cause does not have.
    if (!a || !b) continue;
    const crosses = laneOf.get(e.from) !== laneOf.get(e.to);
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const mid = (x1 + x2) / 2;
    edgePaths.push({
      id: e.id,
      d: `M ${px(x1)} ${px(y1)} C ${px(mid)} ${px(y1)} ${px(mid)} ${px(y2)} ${px(x2)} ${px(y2)}`,
      className:
        'morph-edge ' + (crosses ? 'morph-crossing' : 'morph-edge--faint') + relClass(e.kind),
    });
  }

  const laneBbox: Bbox = { x: 0, y: 0, w: contentW, h: Math.max(y - LANE_GAP, PAD * 2) + PAD };
  const shelf = placeShelf(
    shelved,
    laneBbox,
    // The prompt tells the builder to omit a sphere rather than stretch one, so this band agrees
    // with the contract instead of blaming it.
    `${shelved.length} in no single sphere — this view cannot place these`,
    viewport,
  );
  for (const [id, p] of shelf.positions) positions.set(id, p);
  if (shelf.band) chrome.bands.push(shelf.band);
  foldOnto(positions, folded, {
    x: shelf.bbox.x + PAD,
    y: shelf.bbox.y + PAD,
    w: CARD_W,
    h: CARD_H,
    face: 'card',
  });
  return { rep: 'spheres', positions, edgePaths, chrome, bbox: shelf.bbox };
};
