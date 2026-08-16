import { describe, expect, it } from 'vitest';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { layoutFlow } from '../src/canvas/spatial/morph/layouts/flowLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import { separateRects } from '../src/canvas/spatial/morph/layouts/separate';
import type { MorphEdgeDatum, MorphNodeDatum, WorldData } from '../src/canvas/spatial/morph/types';

// The morph layouts have to stay linear-ish in the size of the world. Every hot path here was
// quadratic at some point — an every-pair relaxation, a depth pass per node over every edge, a
// column filter per column, indexOf() inside a loop over children, a lane scan per entry — and
// each one is invisible on the six-node fixtures the behaviour tests use. These run the layouts at
// a size where a reintroduced quadratic cannot hide, and check they still place every node.
//
// BUDGET_MS is deliberately not a microbenchmark. On the machine this was written on, no single
// call below measured over 400ms; the quadratic versions of the same fixtures took 4.7s (the
// relaxation under a fully unfolded web), 7.1s (a depth pass per node over every edge) and 3.4s
// (separation alone). Three seconds therefore sits ~8× above the cost of the linear versions —
// headroom for a slow, loaded CI runner — while still failing on anything that goes quadratic
// again. Raise the fixture sizes rather than the budget if that margin ever needs widening.
const BUDGET_MS = 3_000;

/** Big enough that O(n²) costs thousands of times O(n), small enough to build in milliseconds. */
const NODES = 4_000;
const CHAIN = 12_000;
const RECTS = 3_000;

const within = (label: string, budget: number, run: () => void): void => {
  const started = performance.now();
  run();
  const elapsed = performance.now() - started;
  expect(elapsed, `${label} took ${Math.round(elapsed)}ms`).toBeLessThan(budget);
};

/** A world shaped like a real answer at scale: a causal web with dated nodes, measured series and
 *  a layer of semantic-zoom children, whose edges arrive in no useful order. */
function bigWorld(n: number): WorldData {
  const nodes: MorphNodeDatum[] = [];
  const edges: MorphEdgeDatum[] = [];
  for (let i = 0; i < n; i++) {
    const start = Date.UTC(1900 + (i % 120), 0, 1);
    nodes.push({
      id: `n${i}`,
      label: `Node ${i}`,
      ...(i % 3 === 0 ? { date: { start } } : {}),
      ...(i % 4 === 0
        ? {
            series: [
              { t: start, v: (i % 17) + 1 },
              { t: start + 5 * 365 * 86_400_000, v: (i % 29) + 2 },
            ],
          }
        : {}),
      ...(i % 5 !== 0 && i > 0 ? { parentId: `n${i - (i % 5)}` } : {}),
    });
    if (i > 0) edges.push({ id: `e${i}`, from: `n${i - 1}`, to: `n${i}`, sign: 1 });
    if (i > 10) edges.push({ id: `x${i}`, from: `n${i - 11}`, to: `n${i}`, sign: 1 });
  }
  edges.reverse();
  return { nodes, edges, outcomeId: `n${n - 1}` };
}

function expectPlacesEveryNode(
  world: WorldData,
  layout: { positions: Map<string, unknown> },
): void {
  expect(layout.positions.size).toBe(world.nodes.length);
  for (const node of world.nodes) expect(layout.positions.has(node.id), node.id).toBe(true);
}

describe('morph layouts at scale', () => {
  const world = bigWorld(NODES);

  // The flow. It asks "does a MEASURED link touch this cause?" of every node, which is a quadratic
  // the moment it is answered by scanning the edge list — so incidence is computed once per world
  // and cached. At 4k nodes a per-node scan is ~48M comparisons and blows the budget by orders of
  // magnitude, while the cached answer is linear.
  it('flow places or shelves every node of a large world', () => {
    within('flow', BUDGET_MS, () => expectPlacesEveryNode(world, layoutFlow(world)));
  });

  it('graph places every node of a large causal web', () => {
    within('graph', BUDGET_MS, () => expectPlacesEveryNode(world, layoutGraph(world)));
  });

  it('graph relaxes a large web with every breakdown unfolded', () => {
    // Expanding everything is what puts the whole world through separateRects at once.
    const expandedIds = new Set(world.nodes.map((n) => n.id));
    within('graph expanded', BUDGET_MS, () =>
      expectPlacesEveryNode(world, layoutGraph(world, { expandedIds })),
    );
  });

  it('graph derives depth on a long chain handed over back-to-front', () => {
    // Reversed edges are the worst case for a relaxation that sweeps the edge list: one pass moved
    // one node. A topological order settles the same chain in a single sweep.
    const chain: WorldData = {
      nodes: Array.from({ length: CHAIN }, (_, i) => ({ id: `c${i}`, label: `C${i}` })),
      edges: Array.from({ length: CHAIN - 1 }, (_, i) => ({
        id: `ce${i}`,
        from: `c${CHAIN - 2 - i}`,
        to: `c${CHAIN - 1 - i}`,
        sign: 1 as const,
      })),
      outcomeId: `c${CHAIN - 1}`,
    };
    within('graph chain', BUDGET_MS, () => {
      const layout = layoutGraph(chain);
      expectPlacesEveryNode(chain, layout);
      // The chain really did resolve into one column per link, roots left, outcome right.
      expect(layout.positions.get('c0')!.x).toBeLessThan(layout.positions.get(`c${CHAIN - 1}`)!.x);
    });
  });

  it('timeline places or shelves every node of a large world', () => {
    within('timeline', BUDGET_MS, () => expectPlacesEveryNode(world, layoutTimeline(world)));
  });

  it('timeline packs rows when every entry overlaps every other', () => {
    // Entries a second apart share one pixel column, so each needs a row of its own — the worst
    // case for the greedy packer, and the one a per-entry lane scan turns quadratic.
    const dense: WorldData = {
      nodes: Array.from({ length: NODES }, (_, i) => ({
        id: `d${i}`,
        label: `D${i}`,
        date: { start: Date.UTC(2000, 0, 1) + i * 1_000 },
      })),
      edges: [],
    };
    within('timeline dense', BUDGET_MS, () => {
      const layout = layoutTimeline(dense);
      expectPlacesEveryNode(dense, layout);
      // Hundreds of rows deep, and every one of them filled from the top: a packer that stopped
      // finding the lowest free row would leave gaps and run the stack far deeper than this. The
      // ceiling is a third rather than a quarter because an entry now reserves its FULL-COUNTER
      // width — 64px wider than its authored box — so genuinely fewer of them share a row. The
      // number that would mean the packer had failed is NODES itself: one row each.
      const rows = new Set([...layout.positions.values()].map((p) => p.y));
      expect(rows.size).toBeGreaterThan(100);
      expect(rows.size).toBeLessThan(NODES / 3);
    });
  });

  it('chart plots or shelves every node of a large world', () => {
    within('chart', BUDGET_MS, () => expectPlacesEveryNode(world, layoutChart(world)));
  });
});

describe('separateRects at scale', () => {
  /** Cards on a stride tighter than their own footprint, so every one overlaps its neighbours on
   *  both axes and the whole lattice has to be blown apart. */
  const lattice = (n: number): Array<{ x: number; y: number; w: number; h: number }> =>
    Array.from({ length: n }, (_, i) => ({
      x: (i % 80) * 190,
      y: Math.floor(i / 80) * 60,
      w: 200,
      h: 64,
    }));

  const worstOverlap = (rects: ReturnType<typeof lattice>): number => {
    let worst = 0;
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const x =
          Math.min(rects[a].x + rects[a].w, rects[b].x + rects[b].w) -
          Math.max(rects[a].x, rects[b].x);
        if (x <= 0) continue;
        const y =
          Math.min(rects[a].y + rects[a].h, rects[b].y + rects[b].h) -
          Math.max(rects[a].y, rects[b].y);
        if (y > 0) worst = Math.max(worst, Math.min(x, y));
      }
    }
    return worst;
  };

  it('settles a thousand overlapping cards with nothing left touching', () => {
    const rects = lattice(1_000);
    within('separate 1k', BUDGET_MS, () => separateRects(rects));
    expect(worstOverlap(rects)).toBe(0);
  });

  it('stays inside the budget on a lattice three times that size', () => {
    // The iteration budget is what bounds this one, not convergence: a pile this size does not
    // finish untangling in 200 passes and never did. What matters is that finding the pairs stays
    // linear — the every-pair sweep took nine times as long here.
    const rects = lattice(RECTS);
    within('separate 3k', BUDGET_MS, () => separateRects(rects));
    for (const r of rects) expect(Number.isFinite(r.x) && Number.isFinite(r.y)).toBe(true);
  });

  it('settles a mixed-size fixture on exactly the same numbers as ever', () => {
    // The broad phase must never change WHERE things land, only how fast they get there — so this
    // pins the settled positions, coincident pairs and all, to the millipixel.
    const rects = Array.from({ length: 12 }, (_, i) => ({
      x: (i % 4) * 40 - 60,
      y: Math.floor(i / 4) * 20,
      w: i % 3 === 0 ? 200 : 120,
      h: i % 2 === 0 ? 64 : 40,
    }));
    rects.push({ x: 0, y: 0, w: 200, h: 64 }, { x: 0, y: 0, w: 200, h: 64 });
    separateRects(rects);
    expect(rects.map((r) => [Math.round(r.x * 100) / 100, Math.round(r.y * 100) / 100])).toEqual([
      [-60, 420.07],
      [-59, -99.93],
      [43, 116.07],
      [98, -163.93],
      [-111, -187.93],
      [-20, 268.07],
      [46, -339.93],
      [85, -99.93],
      [-138.25, 51.09],
      [11.5, -35.93],
      [33, -251.93],
      [66, 204.07],
      [5.75, 28.07],
      [0, 332.07],
    ]);
  });
});
