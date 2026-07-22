import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DiagramFlow } from '../src/canvas/blocks/diagrams/DiagramFlow';
import { DataPipeline } from '../src/canvas/blocks/diagrams/DataPipeline';
import { SysArchDiagram } from '../src/canvas/blocks/diagrams/SysArchDiagram';

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
