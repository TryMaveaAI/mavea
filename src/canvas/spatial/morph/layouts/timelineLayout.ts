// timelineLayout.ts — the when-representation. Dated nodes become entries on a shared year scale:
// x from a linear scale over the dated domain, y by greedy interval packing so overlapping periods
// stack into rows instead of colliding. A period (date.end) gets a band behind its entry; an
// undated node is shelved, never dropped, so the morph back to the graph keeps every node. Edges
// survive only between two dated nodes — an arc to a shelved node would assert a time it doesn't
// have.
import type { Bbox } from '../../camera';
import { scaleLinear } from '../../../lib/scale';
import type {
  ChromeSpec,
  LayoutFn,
  MorphLayout,
  MorphNodeDatum,
  PlacedNode,
  WorldData,
} from '../types';
import {
  DEFAULT_VIEWPORT,
  ENTRY_H,
  ENTRY_SLOT_W,
  ENTRY_W,
  PAD,
  px,
  relClass,
  timeAxis,
  yearOf,
  type TimeAxis,
} from './lanes';
import { placeShelf } from './shelf';

const AXIS_W = 920;
const LANE_GAP = 24;
const LANE_H = ENTRY_H + LANE_GAP;
const AXIS_GAP = 12;
const TICK_H = 8;
/** Minimum clear space between two entries sharing a row. */
const ROW_CLEAR = 12;

interface DatedNode {
  node: MorphNodeDatum;
  startYear: number;
  /** Present only for a true period (end after start). */
  endYear?: number;
}

function datedOf(node: MorphNodeDatum): DatedNode | null {
  if (!node.date || !Number.isFinite(node.date.start)) return null;
  const startYear = yearOf(node.date.start);
  const end = node.date.end;
  const isPeriod = end !== undefined && Number.isFinite(end) && end > node.date.start;
  return { node, startYear, ...(isPeriod ? { endYear: yearOf(end) } : {}) };
}

/** Can this representation put the node on its axis, rather than in the held-aside band? Exported
 *  so a surface deciding whether to OFFER the timeline asks the same question the lane below asks
 *  before shelving — a second copy of the test is a copy that drifts. */
export const placeableOnTimeline = (node: MorphNodeDatum): boolean => datedOf(node) !== null;

/** One axis over every dated node. The domain and its ticks come off the same step (`timeAxis`),
 *  which is what keeps the last event under a label. */
function datedAxis(worlds: WorldData[]): TimeAxis | null {
  let min = Infinity;
  let max = -Infinity;
  for (const world of worlds) {
    for (const node of world.nodes) {
      const dated = datedOf(node);
      if (!dated) continue;
      min = Math.min(min, dated.startYear);
      max = Math.max(max, dated.endYear ?? dated.startYear);
    }
  }
  return min === Infinity ? null : timeAxis(min, max, 6);
}

/** Greedy first-fit row packer. The rows have to fill in index order — the LOWEST row that clears
 *  wins, or the entries drift downwards for no reason — and scanning the rows for each entry costs
 *  O(entries × rows), which goes quadratic the moment every entry needs a row of its own. This
 *  holds each row's cleared-from x in an implicit min-tree and descends it to the leftmost row that
 *  fits, so a fit is O(log rows) and packing n entries is O(n log n) at worst, O(n) space.
 *  `clearedFrom` is stored, not the raw end, so the comparison is the same arithmetic either way. */
function rowPacker(capacity: number): (clearedFrom: number, x0: number) => number {
  let size = 1;
  while (size < capacity) size *= 2;
  const min = new Array<number>(size * 2).fill(Infinity);
  let open = 0;
  return (clearedFrom, x0) => {
    let node = 1;
    if (min[1] <= x0) {
      while (node < size) node = min[node * 2] <= x0 ? node * 2 : node * 2 + 1;
    } else {
      node = size + open++; // nothing clears — open the next row down
    }
    const row = node - size;
    min[node] = clearedFrom;
    while (node > 1) {
      node >>= 1;
      min[node] = Math.min(min[node * 2], min[node * 2 + 1]);
    }
    return row;
  };
}

function place(
  world: WorldData,
  axis: TimeAxis | null,
  viewport: { w: number; h: number },
): Omit<MorphLayout, 'rep'> {
  const dated: DatedNode[] = [];
  const shelved: MorphNodeDatum[] = [];
  for (const node of world.nodes) {
    const d = datedOf(node);
    if (d && axis) dated.push(d);
    else shelved.push(node);
  }
  dated.sort((a, b) => a.startYear - b.startYear || a.node.id.localeCompare(b.node.id));

  const positions = new Map<string, PlacedNode>();
  const chrome: ChromeSpec = { bands: [], paths: [], labels: [] };
  const edgePaths: MorphLayout['edgePaths'] = [];
  const topY = PAD;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = topY;

  if (dated.length > 0 && axis) {
    const x = scaleLinear(axis.domain, [PAD, PAD + AXIS_W]);
    // Greedy interval packing on PIXEL extents (entry + period band), so long labels stack the
    // same way long periods do.
    const packRow = rowPacker(dated.length);
    for (const d of dated) {
      const startX = x(d.startYear);
      const endX = d.endYear !== undefined ? x(d.endYear) : startX;
      const entryX = d.endYear !== undefined ? startX : startX - ENTRY_W / 2;
      // Packed against the entry's FULL-COUNTER width, not its authored one: the counter-scale
      // grows an entry from either side of its own centre, so two entries the authored extents call
      // clear can still touch once the camera has pulled back.
      const bleed = (ENTRY_SLOT_W - ENTRY_W) / 2;
      const ix0 = Math.min(entryX, startX) - bleed;
      const ix1 = Math.max(entryX + ENTRY_W, endX) + bleed;
      const lane = packRow(ix1 + ROW_CLEAR, ix0);
      const y = topY + lane * LANE_H;
      positions.set(d.node.id, {
        x: entryX,
        y,
        w: ENTRY_W,
        h: ENTRY_H,
        face: 'entry',
      });
      if (d.endYear !== undefined) {
        chrome.bands.push({
          id: `period:${d.node.id}`,
          x: startX,
          y: y - 6,
          w: Math.max(endX - startX, 2),
          h: ENTRY_H + 12,
          className: 'morph-period',
        });
      }
      minX = Math.min(minX, ix0);
      maxX = Math.max(maxX, ix1);
      maxY = Math.max(maxY, y + ENTRY_H);
    }

    // The axis under the rows: one line and the ticks the shared step produced, labelled at the
    // granularity the span actually has — a run of events inside one afternoon gets the afternoon.
    const axisY = maxY + LANE_GAP + AXIS_GAP;
    chrome.paths.push({
      id: 'axis',
      d: `M ${px(PAD)} ${px(axisY)} L ${px(PAD + AXIS_W)} ${px(axisY)}`,
      className: 'morph-axis',
    });
    axis.ticks.forEach((tick, i) => {
      const tx = x(tick.year);
      chrome.paths.push({
        id: `tick:${i}`,
        d: `M ${px(tx)} ${px(axisY)} L ${px(tx)} ${px(axisY + TICK_H)}`,
        className: 'morph-tick',
      });
      chrome.labels.push({
        id: `tick-label:${i}`,
        x: tx,
        y: axisY + TICK_H + 16,
        text: tick.text,
        className: 'morph-axis-label',
        anchor: 'middle',
      });
      minX = Math.min(minX, tx - tick.text.length * 3.5);
      maxX = Math.max(maxX, tx + tick.text.length * 3.5);
    });
    minX = Math.min(minX, PAD);
    maxX = Math.max(maxX, PAD + AXIS_W);
    maxY = axisY + TICK_H + 20;

    // Faint arcs between two dated nodes; an edge touching a shelved node is omitted.
    const datedIds = new Set(dated.map((d) => d.node.id));
    for (const e of world.edges) {
      if (e.from === e.to || !datedIds.has(e.from) || !datedIds.has(e.to)) continue;
      const from = positions.get(e.from)!;
      const to = positions.get(e.to)!;
      const x1 = from.x + from.w / 2;
      const x2 = to.x + to.w / 2;
      const y1 = from.y;
      const y2 = to.y;
      const rise = Math.min(72, Math.max(20, Math.abs(x2 - x1) * 0.2));
      edgePaths.push({
        id: e.id,
        d: `M ${px(x1)} ${px(y1)} C ${px(x1)} ${px(y1 - rise)} ${px(x2)} ${px(y2 - rise)} ${px(x2)} ${px(y2)}`,
        className: 'morph-edge morph-edge--faint' + relClass(e.kind),
      });
    }
  }

  const laneBbox: Bbox =
    minX === Infinity
      ? { x: 0, y: 0, w: PAD * 2, h: PAD * 2 }
      : { x: minX - PAD, y: 0, w: maxX - minX + PAD * 2, h: maxY + PAD };
  const shelf = placeShelf(shelved, laneBbox, `${shelved.length} undated — held aside`, viewport);
  if (shelf.band) chrome.bands.push(shelf.band);
  for (const [id, placed] of shelf.positions) positions.set(id, placed);
  return { positions, edgePaths, chrome, bbox: shelf.bbox };
}

export const layoutTimeline: LayoutFn = (world, opts) => ({
  rep: 'timeline',
  ...place(world, datedAxis([world]), opts?.viewport ?? DEFAULT_VIEWPORT),
});
