import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Network } from '../src/canvas/blocks/charts1/Network';
import type { NetworkEdge, NetworkNode } from '../src/canvas/blocks/charts1/types';

// Regression coverage for Network's entrance animation: `.c1-network-node` / `.c1-network-edge`
// (and their keyframes) already existed centrally in charts1/styles.css, but the component never
// applied those classes or set the `--i` stagger custom property, so nodes and edges popped in
// instantly instead of blooming in like every other charts1 sibling (TamSam's rings, Treemap's
// cells). This also checks the salient (highest-degree) node stays correctly marked at a node
// count well beyond the six-node demo fixture, since the hub can shift as edges are added.

function nodes(n: number): NetworkNode[] {
  return Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, group: i % 4 }));
}

// A hub-and-spoke graph: n0 connects to everyone else, so it's unambiguously the highest-degree
// (salient) node regardless of how many peripheral nodes are added.
function hubEdges(n: number): NetworkEdge[] {
  return Array.from({ length: n - 1 }, (_, i) => ({ source: 'n0', target: `n${i + 1}` }));
}

describe('Network', () => {
  it.each([6, 14, 24])('stamps every node and edge with a stagger index at %i nodes', (n) => {
    const { container } = render(
      <Network title="Graph" nodes={nodes(n)} edges={hubEdges(n)} layout="circle" />,
    );
    const nodeGroups = Array.from(container.querySelectorAll<SVGGElement>('.c1-network-node'));
    const edgeLines = Array.from(container.querySelectorAll<SVGLineElement>('.c1-network-edge'));
    expect(nodeGroups).toHaveLength(n);
    expect(edgeLines).toHaveLength(n - 1);

    // Every node/edge carries a distinct --i so the CSS stagger (animation-delay: calc(--i *
    // Nms)) actually fans out instead of every element firing on the same frame.
    const nodeIndices = nodeGroups.map((g) => g.style.getPropertyValue('--i'));
    expect(new Set(nodeIndices).size).toBe(n);
    edgeLines.forEach((line) => {
      expect(line.style.getPropertyValue('--i')).not.toBe('');
    });

    // transform-origin must be set per element (node position / edge midpoint) rather than
    // defaulting to the SVG's top-left — otherwise the scale-in keyframe drifts every element
    // toward viewport (0,0) instead of growing in place.
    nodeGroups.forEach((g) => {
      expect(g.style.transformOrigin).not.toBe('');
      expect(g.style.transformOrigin).not.toBe('0px 0px');
    });
  });

  it('marks exactly one salient (highest-degree) node at a node count beyond the demo fixture', () => {
    const n = 20;
    const { container } = render(
      <Network title="Graph" nodes={nodes(n)} edges={hubEdges(n)} layout="grid" />,
    );
    const marked = container.querySelectorAll('circle[data-mark="circle"]');
    expect(marked).toHaveLength(1);
    // The hub (n0) is the only node touching every edge, so it must be the one marked.
    const markedGroup = marked[0].closest('.c1-network-node');
    expect(markedGroup?.querySelector('text')?.textContent).toBe('Node 0');
  });

  it('lays out a large grid without collapsing any two nodes onto the same point', () => {
    const n = 30;
    const { container } = render(
      <Network title="Graph" nodes={nodes(n)} edges={[]} layout="grid" />,
    );
    // Read cx/cy off every node's primary circle — no two nodes should land on the same point.
    const points = Array.from(container.querySelectorAll('.c1-network-node')).map((g) => {
      const c = g.querySelector('circle')!;
      return `${c.getAttribute('cx')},${c.getAttribute('cy')}`;
    });
    expect(points).toHaveLength(n);
    expect(new Set(points).size).toBe(n);
  });
});
