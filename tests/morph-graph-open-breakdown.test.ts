import { describe, expect, it } from 'vitest';
import { fitScale } from '../src/canvas/spatial/camera';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { COUNTER_MAX } from '../src/canvas/spatial/morph/layouts/lanes';
import type { MorphLayout, WorldData } from '../src/canvas/spatial/morph/types';

// Opening a breakdown changes the composition, not just what is drawn: an open card becomes a
// block several rows tall that reaches past its own right edge. These tests pin that the graph
// PLANS for that block — that it budgets the columns and reading bands against the cards it will
// really lay out — rather than laying the folded web out and shoving the children in afterwards,
// which is how an expanded breakdown used to grow the web past the space it had measured.

/** The stage the surface fits into (useMorphStage's own numbers). */
const VIEWPORT = { w: 1200, h: 760 };
const FIT_MARGIN = 56;
const HINT = { w: VIEWPORT.w - FIT_MARGIN * 2, h: VIEWPORT.h - FIT_MARGIN * 2 };
/** Below this the counter-scale can no longer hold a card at its authored size (morph.css's 1.4). */
const LEGIBLE_SCALE = 1 / 1.4;

/** A five-deep chain whose first depth carries a breakdown — the shape of the world that first
 *  showed the defect: it fits unbroken while folded, with nothing to spare. */
function chainWithBreakdown(children: number): WorldData {
  const nodes: WorldData['nodes'] = [
    { id: 'root', label: 'Root', role: 'root', depth: 0 },
    { id: 'other', label: 'Other root', role: 'root', depth: 0 },
    { id: 'mid-a', label: 'Middle A', role: 'mechanism', depth: 1 },
    { id: 'mid-b', label: 'Middle B', role: 'mechanism', depth: 1 },
    { id: 'late', label: 'Late', role: 'mechanism', depth: 2 },
    { id: 'later', label: 'Later', role: 'mechanism', depth: 3 },
    { id: 'outcome', label: 'Outcome', role: 'outcome', depth: 4 },
  ];
  for (let i = 0; i < children; i++) {
    nodes.push({ id: `root.${i}`, label: `Part ${i}`, parentId: 'root', value: i + 1 });
  }
  return {
    outcomeId: 'outcome',
    nodes,
    edges: [
      { id: 'e1', from: 'root', to: 'mid-a' },
      { id: 'e2', from: 'root', to: 'mid-b' },
      { id: 'e3', from: 'other', to: 'mid-b' },
      { id: 'e4', from: 'mid-a', to: 'late' },
      { id: 'e5', from: 'mid-b', to: 'late' },
      { id: 'e6', from: 'late', to: 'later' },
      { id: 'e7', from: 'later', to: 'outcome' },
    ],
  };
}

const open = (world: WorldData, ...ids: string[]): MorphLayout =>
  layoutGraph(world, { viewport: HINT, expandedIds: new Set(ids) });

/** A placed box grown to the footprint the reader can actually SEE.
 *
 *  The counter-scale blows a face up by as much as COUNTER_MAX as the camera pulls back, around
 *  its own centre — so `w`/`h` are what the card is authored at, never what it occupies. Comparing
 *  the authored boxes is why this file did not catch the bug it exists to catch: children stood
 *  CARD_W + 4 = 204 from their parent, which clears a 200-wide box by 4px and runs 76px into a
 *  280-wide one. Measured in a browser at the camera's floor, every card rendered 280 × 90.
 *
 *  This is the same rule the file's own header states for heights ("the geometry was correct for
 *  boxes nobody was rendering"), applied to the other axis. */
const grown = (b: { x: number; y: number; w: number; h: number }) => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const hw = (b.w * COUNTER_MAX) / 2;
  const hh = (b.h * COUNTER_MAX) / 2;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
};

const overlaps = (layout: MorphLayout): string[] => {
  const placed = [...layout.positions.entries()];
  const bad: string[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [aId, a] = placed[i];
      const [bId, b] = placed[j];
      // A folded breakdown is coincident with its parent by design.
      if (a.x === b.x && a.y === b.y) continue;
      const A = grown(a);
      const B = grown(b);
      if (A.left < B.right && B.left < A.right && A.top < B.bottom && B.top < A.bottom) {
        bad.push(`${aId} overlaps ${bId}`);
      }
    }
  }
  return bad;
};

describe('graph layout — an open breakdown is part of the composition', () => {
  it('re-plans the composition so an open breakdown never drops it below the legibility floor', () => {
    const world = chainWithBreakdown(3);
    const folded = layoutGraph(world, { viewport: HINT });
    // The folded web fits unbroken — the regime where there is no room left to absorb a breakdown.
    expect(fitScale(folded.bbox, VIEWPORT, FIT_MARGIN)).toBeGreaterThanOrEqual(LEGIBLE_SCALE);
    // One band: the causal ground, which every world has. READING bands are what a wrap adds, and
    // an unwrapped composition has none of those — that is the property this pins.
    const readingBands = (l: MorphLayout) =>
      l.chrome.bands.filter((b) => b.className.includes('reading-band'));
    expect(folded.chrome.bands.map((b) => b.id)).toEqual(['causal-ground']);
    expect(readingBands(folded)).toHaveLength(0);

    const expanded = open(world, 'root');
    expect(fitScale(expanded.bbox, VIEWPORT, FIT_MARGIN)).toBeGreaterThanOrEqual(LEGIBLE_SCALE);
    // It bought that by breaking into reading bands, which is the honest answer — not by leaving
    // the plan alone and letting the relaxation push the web wider than the fit box.
    expect(readingBands(expanded).length).toBeGreaterThan(1);
  });

  it('leaves the folded composition untouched', () => {
    const world = chainWithBreakdown(3);
    const plain = layoutGraph(world, { viewport: HINT });
    const closed = layoutGraph(world, { viewport: HINT, expandedIds: new Set(['not-a-node']) });
    for (const [id, n] of plain.positions) {
      expect({ id, ...closed.positions.get(id) }).toEqual({ id, ...n });
    }
  });

  it('stands a breakdown clear of the card it belongs to, in its own reserved room', () => {
    const world = chainWithBreakdown(4);
    const layout = open(world, 'root');
    const parent = layout.positions.get('root')!;
    for (let i = 0; i < 4; i++) {
      const child = layout.positions.get(`root.${i}`)!;
      expect(child.folded, `root.${i}`).toBeUndefined();
      // Beside its parent, not under it — the offset the relaxation used to have to discover.
      expect(child.x, `root.${i}`).toBeGreaterThanOrEqual(parent.x + parent.w);
    }
    expect(overlaps(layout)).toEqual([]);
  });

  it('stacks a nested breakdown without letting two generations share a row', () => {
    const world = chainWithBreakdown(2);
    world.nodes.push(
      { id: 'root.0.a', label: 'Sub A', parentId: 'root.0', value: 1 },
      { id: 'root.0.b', label: 'Sub B', parentId: 'root.0', value: 2 },
    );
    const layout = open(world, 'root', 'root.0');
    expect(layout.positions.size).toBe(world.nodes.length);
    expect(overlaps(layout)).toEqual([]);
    const inner = layout.positions.get('root.0')!;
    for (const id of ['root.0.a', 'root.0.b']) {
      expect(layout.positions.get(id)!.x, id).toBeGreaterThanOrEqual(inner.x + inner.w);
    }
  });

  it('holds up when every card of a depth carries its own breakdown', () => {
    const world = chainWithBreakdown(4);
    for (let i = 0; i < 4; i++) {
      world.nodes.push({ id: `other.${i}`, label: `Other ${i}`, parentId: 'other', value: i + 1 });
    }
    const layout = open(world, 'root', 'other');
    expect(layout.positions.size).toBe(world.nodes.length);
    for (const [id, n] of layout.positions) {
      expect([n.x, n.y, n.w, n.h].every(Number.isFinite), id).toBe(true);
      expect(n.x, id).toBeGreaterThanOrEqual(layout.bbox.x - 0.5);
      expect(n.y, id).toBeGreaterThanOrEqual(layout.bbox.y - 0.5);
      expect(n.x + n.w, id).toBeLessThanOrEqual(layout.bbox.x + layout.bbox.w + 0.5);
      expect(n.y + n.h, id).toBeLessThanOrEqual(layout.bbox.y + layout.bbox.h + 0.5);
    }
    expect(overlaps(layout)).toEqual([]);
    expect(fitScale(layout.bbox, VIEWPORT, FIT_MARGIN)).toBeGreaterThanOrEqual(LEGIBLE_SCALE);
  });

  it('is deterministic with breakdowns open', () => {
    const world = chainWithBreakdown(3);
    const once = open(world, 'root');
    const twice = open(world, 'root');
    for (const [id, n] of once.positions) expect(twice.positions.get(id)).toEqual(n);
  });
});
