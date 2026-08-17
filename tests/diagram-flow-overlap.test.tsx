import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiagramFlow } from '../src/canvas/blocks/diagrams/DiagramFlow';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import { SysArchDiagram } from '../src/canvas/blocks/diagrams/SysArchDiagram';
import { estimateTextWidth } from '../src/canvas/lib/fitText';

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
