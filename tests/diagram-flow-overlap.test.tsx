import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiagramFlow } from '../src/canvas/blocks/diagrams/DiagramFlow';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import { SysArchDiagram } from '../src/canvas/blocks/diagrams/SysArchDiagram';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import { honouredPlacements, honouredSpread } from '../src/canvas/blocks/diagrams/placement';

// The real-world case that surfaced the bug: a seven-era history of gaming as a left-to-right
// chain. With a fixed viewBox width, the fixed-size nodes were packed closer than their own
// width, so each node painted over its neighbour's label — the labels promise to be "never
// clipped", yet they vanished under the overlap. DiagramFlow, DataPipeline and SysArchDiagram
// share the same layered layout, so all three grow the viewBox width with the column count (as
// its height already grows with rows) and none may ever collide.
const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const LABELS = [
  'Arcades',
  'Home consoles',
  'PC gaming',
  '3D graphics',
  'Online multiplayer',
  'Mobile & stores',
  'Streaming & immersive',
];
const chain = IDS.slice(1).map((to, i) => ({ from: IDS[i], to }));

/** Node centres, read left-to-right. Every family labels a node with a `<text x={cx}>`, so its
 *  label anchors ARE the node centres — the geometry we assert against. */
function centres(container: HTMLElement, labelClass: string): number[] {
  return [...container.querySelectorAll(`text.${labelClass}`)]
    .map((el) => parseFloat(el.getAttribute('x') || '0'))
    .sort((a, b) => a - b);
}

function assertNoOverlap(centresList: number[], minGap: number, who: string): void {
  expect(centresList, `${who}: expected 7 nodes`).toHaveLength(7);
  for (let i = 1; i < centresList.length; i++) {
    const gap = centresList[i] - centresList[i - 1];
    expect(
      gap,
      `${who}: nodes ${i - 1}→${i} overlap (gap ${gap.toFixed(1)} < ${minGap})`,
    ).toBeGreaterThanOrEqual(minGap);
  }
}

describe('diagram families never overlap nodes in a dense chain', () => {
  it('DiagramFlow keeps a seven-node layered chain from colliding', () => {
    const nodes = IDS.map((id, i) => ({ id, label: LABELS[i], sub: 'detail' }));
    const { container } = render(
      <DiagramFlow title="History of gaming" layout="layered" nodes={nodes} edges={chain} />,
    );
    // Its ellipses expose an explicit radius; assert against the true diameter.
    const rx = parseFloat(container.querySelector('ellipse')?.getAttribute('rx') || '0');
    assertNoOverlap(centres(container, 'dg-node-label'), rx * 2, 'DiagramFlow');
  });

  it('DataPipeline keeps a seven-stage chain from colliding', () => {
    const stages = IDS.map((id, i) => ({ id, label: LABELS[i], kind: 'transform' as const }));
    const { container } = render(<DataPipeline title="Pipeline" stages={stages} edges={chain} />);
    // NODE_W is 186; a gap of at least that keeps the 186-wide shapes from touching.
    assertNoOverlap(centres(container, 'dp-label'), 186, 'DataPipeline');
  });

  it('SysArchDiagram keeps a seven-node chain from colliding', () => {
    const nodes = IDS.map((id, i) => ({ id, label: LABELS[i], kind: 'service' as const }));
    const { container } = render(
      <SysArchDiagram title="Architecture" nodes={nodes} edges={chain} />,
    );
    assertNoOverlap(centres(container, 'sa-label'), 186, 'SysArchDiagram');
  });
});

// The node-vs-node check above passed throughout the bug below, which is exactly why it shipped: a
// chain whose NODES clear each other perfectly still hid every EDGE label. The labels were fitted to
// a flat 220 units while a layered column left 28 units of clear air between rims, and they were
// drawn before the nodes — so each verb spilled under both neighbouring ellipses and was painted
// over, leaving the reader a sliver ("wid", "ven", "cont") of a label that promises never to clip.
describe('an edge label in a dense chain is never hidden by the nodes it connects', () => {
  const VERBS = ['cash strain widens', 'cannot refinance', 'triggers', 'forces', 'ends in'];
  const labelledChain = chain.map((e, i) => ({ ...e, label: VERBS[i % VERBS.length] }));
  const nodes = IDS.map((id, i) => ({ id, label: LABELS[i], sub: 'detail' }));

  const render7 = () =>
    render(
      <DiagramFlow
        title="How a retailer fails"
        layout="layered"
        nodes={nodes}
        edges={labelledChain}
      />,
    );

  /** Widest rendered line of a fitted label, in the same user units as the geometry. */
  function labelWidths(container: HTMLElement): number[] {
    return [...container.querySelectorAll('text.dg-edge-label')].map((el) => {
      const fontSize = parseFloat(el.getAttribute('font-size') || '0');
      const lines = [...el.querySelectorAll('tspan')].map((t) => t.textContent ?? '');
      return Math.max(...lines.map((ln) => estimateTextWidth(ln, fontSize, true)));
    });
  }

  it('fits every label inside the clear air between the two rims it sits between', () => {
    const { container } = render7();
    const rx = parseFloat(container.querySelector('ellipse')?.getAttribute('rx') || '0');
    const cs = centres(container, 'dg-node-label');
    const gaps = cs.slice(1).map((x, i) => x - cs[i] - rx * 2);
    const narrowest = Math.min(...gaps);
    const widths = labelWidths(container);

    expect(widths, 'expected one label per edge').toHaveLength(labelledChain.length);
    for (const [i, w] of widths.entries()) {
      expect(
        w,
        `label ${i} ("${VERBS[i % VERBS.length]}") is ${w.toFixed(1)} wide in a ${narrowest.toFixed(1)} gap`,
      ).toBeLessThanOrEqual(narrowest);
    }
  });

  it('widens the figure for a long verb instead of hiding it', () => {
    const wide = render7().container.querySelector('svg.dg-svg')!.getAttribute('viewBox');
    const bare = render(
      <DiagramFlow title="How a retailer fails" layout="layered" nodes={nodes} edges={chain} />,
    )
      .container.querySelector('svg.dg-svg')!
      .getAttribute('viewBox');
    const w = (vb: string | null) => parseFloat((vb ?? '0 0 0 0').split(' ')[2]);
    expect(
      w(wide),
      'labelled chain should buy room the unlabelled one does not need',
    ).toBeGreaterThan(w(bare));
  });

  it('paints the labels after the nodes, so an overlap can never bury one', () => {
    const { container } = render7();
    const marks = [...container.querySelectorAll('ellipse, text.dg-edge-label')].map(
      (el) => el.tagName,
    );
    const lastNode = marks.lastIndexOf('ellipse');
    const firstLabel = marks.indexOf('text');
    expect(firstLabel, 'no edge labels rendered').toBeGreaterThanOrEqual(0);
    expect(
      firstLabel,
      'an edge label is painted before a node and can be covered by it',
    ).toBeGreaterThan(lastNode);
  });
});

describe('a placement the figure cannot read is not a placement', () => {
  // The real case: a three-node "X-Y-Z bullet formula" that arrived with coordinates on some
  // other scale. `x`/`y` are contracted as a 0..1 unit canvas and every out-of-range value was
  // clamped to 1, so all three nodes landed on the SAME point in the bottom-right corner — three
  // labels piled on one ellipse over a card of empty space. An unreadable hint is worth less than
  // the layout it displaced, so the figure lays itself out instead.
  const nodes = (x: number[], y: number[]) =>
    ['a', 'b', 'c'].map((id, i) => ({
      id,
      label: ['Accomplished [X]', 'as measured by [Y]', 'by doing [Z]'][i],
      x: x[i],
      y: y[i],
    }));
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];

  function spread(container: HTMLElement): number[] {
    return centres(container, 'dg-node-label');
  }

  it('lays out a figure whose coordinates are on a 0..100 scale', () => {
    const { container } = render(
      <DiagramFlow
        title="The X-Y-Z bullet formula"
        layout="layered"
        nodes={nodes([10, 50, 90], [50, 50, 50])}
        edges={edges}
      />,
    );
    const xs = spread(container);
    expect(xs).toHaveLength(3);
    // Three distinct columns, not one pile.
    expect(new Set(xs).size).toBe(3);
  });

  it('lays out a figure whose authored points all land on one spot', () => {
    const { container } = render(
      <DiagramFlow
        title="Collapsed"
        layout="layered"
        nodes={nodes([1, 1, 1], [1, 1, 1])}
        edges={edges}
      />,
    );
    expect(new Set(spread(container)).size).toBe(3);
  });

  it('still honours a genuine unit placement', () => {
    const { container } = render(
      <DiagramFlow
        title="Hand-tuned"
        layout="free"
        nodes={nodes([0, 0.5, 1], [0.5, 0.5, 0.5])}
        edges={edges}
      />,
    );
    const xs = spread(container);
    expect(xs).toHaveLength(3);
    expect(new Set(xs).size).toBe(3);
    // The authored order is preserved across the full width, which auto-placement would not do
    // for a three-node `free` grid (it tiles 2×2).
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
});

describe('SysArchDiagram reads placement by the same rule', () => {
  // The same four lines lived in both families, so the pile was possible in both. One rule now,
  // shared — this is the test that the second family actually got it.
  const nodes = ['a', 'b', 'c'].map((id, i) => ({
    id,
    label: ['Client', 'API', 'Store'][i],
    kind: 'service' as const,
    x: [10, 50, 90][i],
    y: [50, 50, 50][i],
  }));
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];

  it('lays out rather than piling when the coordinates are out of range', () => {
    const { container } = render(
      <SysArchDiagram title="Out of scale" nodes={nodes} edges={edges} />,
    );
    const xs = centres(container, 'sa-label');
    expect(xs).toHaveLength(3);
    expect(new Set(xs).size).toBe(3);
  });
});

describe('honouredSpread', () => {
  // A figure sizes its frame from the layout it planned, and an honoured node is by definition
  // not in that layout — it lands on the unit point it authored, inside a frame some other
  // node's row count chose. This is the frame those placements need for themselves.
  const spreadOf = (points: { x?: number; y?: number }[]) =>
    honouredSpread(points, honouredPlacements(points));

  it('asks for nothing when no placement was honoured', () => {
    // Coordinates on a 0..100 scale are unreadable, so nothing is honoured and the planned
    // frame stands exactly as it was.
    expect(
      spreadOf([
        { x: 10, y: 50 },
        { x: 90, y: 50 },
      ]),
    ).toEqual({ rows: 0, columns: 0 });
  });

  it('asks for one band when a single node is placed', () => {
    expect(spreadOf([{ x: 0.25, y: 0.75 }])).toEqual({ rows: 1, columns: 1 });
  });

  it('counts a row of three as three columns, because columns sit edge to edge', () => {
    // x 0 / 0.5 / 1 are half the canvas apart, so two spacings separate them — and a layered
    // figure draws columns at c/(columns - 1), which takes one column more than it has
    // spacings. Every node shares a y, so one row holds them all.
    expect(
      spreadOf([
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
    ).toEqual({ rows: 1, columns: 3 });
  });

  it('counts three stacked bands as three rows', () => {
    // Nine nodes on three y bands 0.4 of the canvas apart. Rows sit at (r + 0.5)/rows, so each
    // one clears a node on its own and no extra row is bought. They share one x.
    const stacked = [0.1, 0.5, 0.9].flatMap((y) => [0, 1, 2].map(() => ({ x: 0.5, y })));
    expect(spreadOf(stacked)).toEqual({ rows: 3, columns: 1 });
  });

  it('never grows the frame for two bands that already touch', () => {
    // 0.5 and 0.55 sit a twentieth of the canvas apart, so separating them by a whole band
    // would take twenty rows: a card of empty space around two nodes that still touch. The
    // answer is capped at the number of nodes there are to stack — two.
    expect(
      spreadOf([
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.55 },
      ]),
    ).toEqual({ rows: 2, columns: 1 });
  });
});

describe('a frame grows to hold the placements it honoured', () => {
  // Nine nodes hand-placed on a 3x3 unit grid. Every one of them is honoured, so the plan they
  // displaced is empty and nothing in the layout asks for height — the figure used to draw all
  // three bands inside its 300-unit floor, which puts 92-unit-tall nodes 46 apart and overlaps
  // every band with the next by half a node. The frame is sized from the placements instead.
  const GRID = [0.1, 0.5, 0.9];
  const nodes = GRID.flatMap((y, r) =>
    GRID.map((x, c) => ({ id: `n${r}${c}`, label: `Step ${r}${c}`, x, y })),
  );
  const NODE_H = 92; // NODE_RY is 46 — a node is its own diameter tall
  const NODE_W = 184; // …and NODE_RX 92 wide
  const MIN_VBH = 300; // the single-row floor the figure keeps when nothing asks for more

  const render9 = () =>
    render(<DiagramFlow title="Stacked" layout="free" nodes={nodes} edges={[]} />);

  /** The distinct label positions down (or across) the figure. Every label here is one line at
   *  one size, so a label rides a fixed offset from its node's centre and the gaps between
   *  bands are the gaps between the nodes themselves. */
  function bands(container: HTMLElement, axis: 'x' | 'y'): number[] {
    const at = [...container.querySelectorAll('text.dg-node-label tspan')].map(
      (t) => Math.round(parseFloat(t.getAttribute(axis) || '0') * 100) / 100,
    );
    return [...new Set(at)].sort((a, b) => a - b);
  }

  function assertBandsClear(list: number[], minGap: number, axis: string): void {
    expect(list, `expected three ${axis} bands`).toHaveLength(3);
    for (let i = 1; i < list.length; i++) {
      const gap = list[i] - list[i - 1];
      expect(
        gap,
        `${axis} bands ${i - 1}→${i} overlap (gap ${gap.toFixed(1)} < ${minGap})`,
      ).toBeGreaterThanOrEqual(minGap);
    }
  }

  it('keeps three placed rows a full node apart', () => {
    const { container } = render9();
    assertBandsClear(bands(container, 'y'), NODE_H, 'y');

    const vbH = parseFloat(
      (container.querySelector('svg.dg-svg')?.getAttribute('viewBox') ?? '0 0 0 0').split(' ')[3],
    );
    expect(vbH, 'the frame kept its single-row floor for a three-row figure').toBeGreaterThan(
      MIN_VBH,
    );
  });

  it('keeps three placed columns a full node apart', () => {
    assertBandsClear(bands(render9().container, 'x'), NODE_W, 'x');
  });
});
