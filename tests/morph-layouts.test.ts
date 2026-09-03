import { describe, expect, it } from 'vitest';
import { layoutChart } from '../src/canvas/spatial/morph/layouts/chartLayout';
import { layoutFlow } from '../src/canvas/spatial/morph/layouts/flowLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { layoutSpheres } from '../src/canvas/spatial/morph/layouts/spheresLayout';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import { COUNTER_MAX, MARK } from '../src/canvas/spatial/morph/layouts/lanes';
import type {
  LayoutFn,
  MorphLayout,
  PlacedNode,
  WorldData,
} from '../src/canvas/spatial/morph/types';

// The morph contract in one sentence: three layouts, one world, and no layout may ever lose a
// node — a representation that cannot place something honestly shelves it in a labeled band.
// These tests pin that invariant plus the properties the morphing surface leans on: determinism,
// a bbox that really contains everything, shared scales across the what-if fork, previous-seeded
// ordering stability, and depth derivation that survives a diamond DAG and a cycle.

const Y1990 = Date.UTC(1990, 0, 1);
const Y1994 = Date.UTC(1994, 0, 1);
const Y1995 = Date.UTC(1995, 0, 1);
const Y2000 = Date.UTC(2000, 0, 1);
const Y2004 = Date.UTC(2004, 0, 1);
const Y2010 = Date.UTC(2010, 0, 1);

/** Dated + undated, series + none, and a container whose magnitude lives in its children. */
const mixedWorld: WorldData = {
  outcomeId: 'outcome',
  nodes: [
    {
      id: 'root-a',
      label: 'Root A',
      role: 'root',
      date: { start: Y1990 },
      series: [
        { t: Y1990, v: 4 },
        { t: Y2000, v: 9 },
      ],
    },
    { id: 'root-b', label: 'Root B', role: 'root', date: { start: Y1994, end: Y2004 } },
    { id: 'mech', label: 'Mechanism', role: 'mechanism' },
    {
      id: 'outcome',
      label: 'Outcome',
      role: 'outcome',
      date: { start: Y2010 },
      series: [
        { t: Y1995, v: 2 },
        { t: Y2010, v: 12 },
      ],
    },
    { id: 'child-1', label: 'Child 1', parentId: 'mech', value: 3 },
    { id: 'child-2', label: 'Child 2', parentId: 'mech', value: 5 },
  ],
  edges: [
    { id: 'e1', from: 'root-a', to: 'mech', sign: 1 },
    { id: 'e2', from: 'root-b', to: 'mech', sign: -1 },
    { id: 'e3', from: 'mech', to: 'outcome' },
    { id: 'e4', from: 'root-a', to: 'outcome' },
  ],
};

/** Every layout. The invariants below hold for all of them, whatever they draw. */
const layouts: Array<[string, LayoutFn]> = [
  ['graph', layoutGraph],
  ['timeline', layoutTimeline],
  ['chart', layoutChart],
  ['flow', layoutFlow],
  ['spheres', layoutSpheres],
];

function expectInsideBbox(layout: MorphLayout): void {
  const { bbox } = layout;
  for (const [id, p] of layout.positions) {
    expect(p.x, `${id} left`).toBeGreaterThanOrEqual(bbox.x - 0.5);
    expect(p.y, `${id} top`).toBeGreaterThanOrEqual(bbox.y - 0.5);
    expect(p.x + p.w, `${id} right`).toBeLessThanOrEqual(bbox.x + bbox.w + 0.5);
    expect(p.y + p.h, `${id} bottom`).toBeLessThanOrEqual(bbox.y + bbox.h + 0.5);
  }
  for (const band of layout.chrome.bands) {
    expect(band.y, `${band.id} top`).toBeGreaterThanOrEqual(bbox.y - 0.5);
    expect(band.y + band.h, `${band.id} bottom`).toBeLessThanOrEqual(bbox.y + bbox.h + 0.5);
  }
}

describe('morph layouts — shared invariants', () => {
  for (const [name, fn] of layouts) {
    it(`${name}: places or shelves every node, never drops one`, () => {
      const layout = fn(mixedWorld);
      for (const node of mixedWorld.nodes) {
        expect(layout.positions.has(node.id), node.id).toBe(true);
      }
    });

    it(`${name}: is deterministic`, () => {
      expect(fn(mixedWorld)).toEqual(fn(mixedWorld));
    });

    it(`${name}: bbox contains every footprint, shelf included`, () => {
      expectInsideBbox(fn(mixedWorld));
    });

    it(`${name}: survives an empty world`, () => {
      const layout = fn({ nodes: [], edges: [] });
      expect(layout.positions.size).toBe(0);
      expect(layout.bbox.w).toBeGreaterThan(0);
      expect(layout.bbox.h).toBeGreaterThan(0);
    });
  }
});

/** A causal chain n links long: one node per depth, one edge between each pair. */
function chainWorld(n: number): WorldData {
  return {
    outcomeId: `c${n - 1}`,
    nodes: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, label: `Cause ${i}` })),
    edges: Array.from({ length: n - 1 }, (_, i) => ({
      id: `e${i}`,
      from: `c${i}`,
      to: `c${i + 1}`,
    })),
  };
}

/** The numbers in a path's `d`, in order — the first pair is where it starts, the last where the
 *  arrowhead lands. */
function ends(d: string): { from: [number, number]; to: [number, number] } {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { from: [n[0], n[1]], to: [n[n.length - 2], n[n.length - 1]] };
}

describe('graph layout', () => {
  it('none of the mixed world is shelved — a graph can always place a node', () => {
    const layout = layoutGraph(mixedWorld);
    for (const p of layout.positions.values()) expect(p.shelved).toBeUndefined();
  });

  it('wraps a long chain into reading bands instead of one unreadable ribbon', () => {
    const chain = chainWorld(12);
    const flat = layoutGraph(chain, { viewport: { w: 100_000, h: 400 } });
    const wrapped = layoutGraph(chain);

    // Given room, the chain stays on one line: x strictly increases and the height is one row.
    for (let i = 1; i < 12; i++) {
      expect(flat.positions.get(`c${i}`)!.x).toBeGreaterThan(flat.positions.get(`c${i - 1}`)!.x);
    }
    // Fitted into a laptop stage it wraps — same order, read left to right and then down, and a
    // composition a landscape viewport can actually hold.
    expect(wrapped.bbox.w / wrapped.bbox.h).toBeLessThan(2.6);
    expect(wrapped.bbox.w).toBeLessThan(flat.bbox.w / 2);
    let breaks = 0;
    for (let i = 1; i < 12; i++) {
      const prev = wrapped.positions.get(`c${i - 1}`)!;
      const cur = wrapped.positions.get(`c${i}`)!;
      if (cur.x > prev.x) continue;
      breaks += 1;
      expect(cur.y, `c${i} continues below c${i - 1}`).toBeGreaterThan(prev.y);
    }
    expect(breaks).toBeGreaterThan(0);
  });

  it('a wrapped edge still joins the two cards it belongs to', () => {
    const wrapped = layoutGraph(chainWorld(12));
    expect(wrapped.edgePaths.some((e) => e.className.includes('morph-edge--wrap'))).toBe(true);
    for (const edge of wrapped.edgePaths) {
      const [, i] = /^e(\d+)$/.exec(edge.id)!;
      const from = wrapped.positions.get(`c${i}`)!;
      const to = wrapped.positions.get(`c${Number(i) + 1}`)!;
      const { from: start, to: end } = ends(edge.d);
      expect(start[0], `${edge.id} leaves its source`).toBeCloseTo(from.x + from.w, 1);
      expect(start[1]).toBeGreaterThanOrEqual(from.y);
      expect(start[1]).toBeLessThanOrEqual(from.y + from.h);
      expect(end[0], `${edge.id} lands on its target`).toBeCloseTo(to.x, 1);
      expect(end[1]).toBeGreaterThanOrEqual(to.y);
      expect(end[1]).toBeLessThanOrEqual(to.y + to.h);
    }
  });

  it('marks a folded breakdown so it cannot paint over the card it belongs to', () => {
    const folded = layoutGraph(mixedWorld).positions;
    expect(folded.get('child-1')!.folded).toBe(true);
    expect(folded.get('mech')!.folded).toBeUndefined();

    const open = layoutGraph(mixedWorld, { expandedIds: new Set(['mech']) }).positions;
    expect(open.get('child-1')!.folded).toBeUndefined();
  });

  it('derives depth from a diamond DAG: root left, middle shared, outcome right', () => {
    const diamond: WorldData = {
      outcomeId: 'd',
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
        { id: 'd', label: 'D' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ac', from: 'a', to: 'c' },
        { id: 'bd', from: 'b', to: 'd' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
    };
    const pos = layoutGraph(diamond).positions;
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x);
    expect(pos.get('b')!.x).toBe(pos.get('c')!.x);
    expect(pos.get('d')!.x).toBeGreaterThan(pos.get('b')!.x);
  });

  it('tolerates a cycle without hanging and still places every node', () => {
    const cycle: WorldData = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bc', from: 'b', to: 'c' },
        { id: 'ca', from: 'c', to: 'a' },
      ],
    };
    const layout = layoutGraph(cycle);
    expect(layout.positions.size).toBe(3);
    expect(layout).toEqual(layoutGraph(cycle));
  });

  it('folds children onto their parent until expanded, then relaxes them apart', () => {
    const folded = layoutGraph(mixedWorld).positions;
    const parent = folded.get('mech')!;
    expect(folded.get('child-1')!.x).toBe(parent.x);
    expect(folded.get('child-1')!.y).toBe(parent.y);

    const layout = layoutGraph(mixedWorld, { expandedIds: new Set(['mech']) });
    const placed = [...layout.positions.values()];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapX > 0 && overlapY > 0, `${i} overlaps ${j}`).toBe(false);
      }
    }
    expectInsideBbox(layout);
  });

  it('previous positions keep row ordering stable when a node is appended', () => {
    const roots = (ids: string[]): WorldData => ({
      nodes: ids.map((id) => ({ id, label: id.toUpperCase() })),
      edges: [],
    });
    const first = layoutGraph(roots(['r1', 'r2', 'r3']));
    // The next turn appends a node AND happens to hand the nodes over in a different order —
    // previous positions, not arrival order, decide where the old rows sit.
    const second = layoutGraph(roots(['r3', 'r1', 'r2', 'r4']), { previous: first.positions });
    const yOf = (l: MorphLayout, id: string): number => l.positions.get(id)!.y;
    expect(yOf(second, 'r1')).toBeLessThan(yOf(second, 'r2'));
    expect(yOf(second, 'r2')).toBeLessThan(yOf(second, 'r3'));
    expect(second.positions.has('r4')).toBe(true);
  });
});

describe('timeline layout', () => {
  it('shelves exactly the undated CAUSES, in a labeled band', () => {
    const layout = layoutTimeline(mixedWorld);
    const shelvedIds = [...layout.positions.entries()]
      .filter(([, p]) => p.shelved)
      .map(([id]) => id)
      .sort();
    // A breakdown the reader has not opened is not on this axis at all — it folds onto its cause,
    // exactly as on the causal web. Shelving it instead would inflate the count in the band's own
    // label with parts nobody asked to see, which is the one number that band exists to keep honest.
    expect(shelvedIds).toEqual(['mech']);
    const band = layout.chrome.bands.find((b) => b.id === 'shelf');
    expect(band?.label).toBe('1 with no date — the timeline cannot place these');
    for (const id of ['child-1', 'child-2']) {
      const p = layout.positions.get(id)!;
      expect(p.folded, id).toBe(true);
      expect(p.shelved, id).toBeUndefined();
    }
    for (const id of ['root-a', 'root-b', 'outcome']) {
      const p = layout.positions.get(id)!;
      expect(p.face).toBe('entry');
      expect(p.shelved).toBeUndefined();
    }
  });

  it('places an OPENED part on the axis, where its date is a real claim', () => {
    const open = layoutTimeline(mixedWorld, { expandedIds: new Set(['mech']) });
    for (const id of ['child-1', 'child-2']) {
      const p = open.positions.get(id)!;
      // Dated or not, an opened part is drawn — on the axis if it has a date, in the band if not.
      expect(p.folded, id).toBeUndefined();
    }
  });

  it('stacks overlapping periods into separate rows and bands the periods', () => {
    const overlapping: WorldData = {
      nodes: [
        { id: 'p1', label: 'P1', date: { start: Y1990, end: Y2000 } },
        { id: 'p2', label: 'P2', date: { start: Y1994, end: Y2004 } },
      ],
      edges: [],
    };
    const layout = layoutTimeline(overlapping);
    expect(layout.positions.get('p1')!.y).not.toBe(layout.positions.get('p2')!.y);
    expect(layout.chrome.bands.filter((b) => b.className.includes('morph-period'))).toHaveLength(2);
  });

  it('keeps only edges between two dated nodes', () => {
    const ids = layoutTimeline(mixedWorld).edgePaths.map((e) => e.id);
    expect(ids).toContain('e4'); // root-a → outcome, both dated
    expect(ids).not.toContain('e1'); // mech is shelved
  });
});

describe('chart layout', () => {
  it('shelves nodes without a measured series and never invents a line for them', () => {
    const layout = layoutChart(mixedWorld);
    const shelvedIds = [...layout.positions.entries()]
      .filter(([, p]) => p.shelved)
      .map(([id]) => id)
      .sort();
    // Unopened parts fold onto their cause rather than padding the band — the count in that label is
    // a statement about the WORLD, not about how much of a breakdown the reader has bought.
    expect(shelvedIds).toEqual(['mech', 'root-b']);
    expect(layout.chrome.bands.find((b) => b.id === 'shelf')?.label).toBe(
      '2 with nothing measured over time — the chart cannot plot these',
    );
    for (const id of ['child-1', 'child-2']) {
      expect(layout.positions.get(id)!.folded, id).toBe(true);
    }
    const seriesIds = layout.chrome.paths.filter((p) => p.draw).map((p) => p.id);
    expect(seriesIds.sort()).toEqual(['series:outcome', 'series:root-a']);
  });

  it('anchors each mark on its series last point', () => {
    const layout = layoutChart(mixedWorld);
    const markCentre = (id: string): number => {
      const p = layout.positions.get(id)!;
      expect(p.face).toBe('mark');
      return p.x + p.w / 2;
    };
    // outcome's series runs to 2010, root-a's to 2000 — the later mark sits further right.
    expect(markCentre('outcome')).toBeGreaterThan(markCentre('root-a'));
  });

  it('keeps every mark out of its neighbour’s hit box, however many share a final value', () => {
    // Twelve series meeting on one value in one unit — the shape a generated cascade produces, and
    // the only way marks land on the same pixel. A mark is the node's whole affordance on the
    // chart, and it is drawn in the NODE's own space, which the counter-scale stretches against the
    // world these positions are measured in: two marks a bare MARK apart in world units still
    // overlap on screen. What is pinned is that reservation, never a band height.
    const converging: WorldData = {
      nodes: Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        label: `Series ${i}`,
        unit: 'MW',
        series: [
          { t: Y1990, v: i + 1 },
          { t: Y2010, v: 500 },
        ],
      })),
      edges: [],
    };
    const centres = [...layoutChart(converging).positions.values()]
      .filter((p) => p.face === 'mark')
      .map((p) => p.y + p.h / 2)
      .sort((a, b) => a - b);
    expect(centres).toHaveLength(12);
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i] - centres[i - 1]).toBeGreaterThanOrEqual(MARK * COUNTER_MAX - 0.01);
    }
  });

  it('spreads end labels apart when series converge', () => {
    const converging: WorldData = {
      nodes: ['s1', 's2', 's3'].map((id) => ({
        id,
        label: id.toUpperCase(),
        series: [
          { t: Y1990, v: Number(id.slice(1)) },
          { t: Y2010, v: 10 }, // all three meet at the same final value
        ],
      })),
      edges: [],
    };
    const labels = layoutChart(converging)
      .chrome.labels.filter((l) => l.className.includes('morph-series-label'))
      .sort((a, b) => a.y - b.y);
    expect(labels).toHaveLength(3);
    expect(labels[1].y - labels[0].y).toBeGreaterThanOrEqual(15.5);
    expect(labels[2].y - labels[1].y).toBeGreaterThanOrEqual(15.5);
  });
});

describe('placed node faces', () => {
  it('are card / entry / mark across the three representations', () => {
    expect(layoutGraph(mixedWorld).positions.get('root-a')!.face).toBe('card');
    expect(layoutTimeline(mixedWorld).positions.get('root-a')!.face).toBe('entry');
    expect(layoutChart(mixedWorld).positions.get('root-a')!.face).toBe('mark');
  });
});

// PlacedNode is structurally a superset of the previous-position seed — the type-level tie that
// lets one layout's output seed the next without an adapter.
const _seedCheck: Parameters<LayoutFn>[1] = { previous: new Map<string, PlacedNode>() };
void _seedCheck;

describe('edge relation vocabulary', () => {
  const withKind = (kind: string | undefined): WorldData => ({
    outcomeId: 'b',
    nodes: [
      { id: 'a', label: 'A', role: 'root', date: { start: Y1990 } },
      { id: 'b', label: 'B', role: 'outcome', date: { start: Y2000 } },
    ],
    edges: [{ id: 'e', from: 'a', to: 'b', ...(kind === undefined ? {} : { kind }) }],
  });

  const classOf = (layout: MorphLayout): string => layout.edgePaths[0]!.className;

  it.each(['causes', 'contributes', 'enables', 'correlates'])(
    'names the %s relation so the sheet can draw its own tip',
    (kind) => {
      expect(classOf(layoutGraph(withKind(kind)))).toContain(`morph-edge--rel-${kind}`);
      expect(classOf(layoutTimeline(withKind(kind)))).toContain(`morph-edge--rel-${kind}`);
    },
  );

  it('says nothing when the edge claims no relation', () => {
    expect(classOf(layoutGraph(withKind(undefined)))).not.toContain('morph-edge--rel-');
  });

  it('keeps the direction of the push when the same web is read as contributions', () => {
    // `--damp` is the only carrier of "this one held the outcome DOWN" — the warning stroke and
    // the crossbar head. Flow left it off, so switching from the causal web to contributions
    // silently repainted every dampening link like every other, while sizing its ribbon by how
    // much of the outcome it explains.
    const signed: WorldData = {
      outcomeId: 'out',
      nodes: [
        { id: 'up', label: 'Up', role: 'root' },
        { id: 'down', label: 'Down', role: 'root' },
        { id: 'out', label: 'Out', role: 'outcome' },
      ],
      edges: [
        { id: 'e-up', from: 'up', to: 'out', sign: 1, weight: 0.6 },
        { id: 'e-down', from: 'down', to: 'out', sign: -1, weight: 0.4 },
      ],
    };
    const classIn = (layout: MorphLayout, id: string): string =>
      layout.edgePaths.find((e) => e.id === id)!.className;

    for (const fn of [layoutFlow, layoutGraph]) {
      expect(classIn(fn(signed), 'e-down')).toContain('morph-edge--damp');
      expect(classIn(fn(signed), 'e-up')).not.toContain('morph-edge--damp');
    }
  });

  it.each(['x y', 'Causes', 'a'.repeat(25), '"><script>'])(
    'refuses to paste %j into a class name',
    (junk) => {
      // The kind is a free string at this layer, and a class is a contract with the stylesheet —
      // never a place to echo model text.
      expect(classOf(layoutGraph(withKind(junk)))).not.toContain('morph-edge--rel-');
    },
  );
});
