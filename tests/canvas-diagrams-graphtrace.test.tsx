import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GraphTrace } from '../src/canvas/blocks/diagrams/GraphTrace';
import type { GraphTraceEdge, GraphTraceNode } from '../src/canvas/blocks/diagrams/types';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: node labels were rendered as plain SVG text with no width
// constraint against the ~44px-diameter node circle (NODE_R=22) — a longer label than the demo's
// short single letters (e.g. a real node name) rendered wider than the circle and visually
// collided with neighbouring nodes/edges once the graph had more than a couple of nodes.

function chain(
  n: number,
  longLabels: boolean,
): { nodes: GraphTraceNode[]; edges: GraphTraceEdge[] } {
  const nodes: GraphTraceNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: longLabels ? `Node Alpha ${i}` : `${i}`,
  }));
  const edges: GraphTraceEdge[] = [];
  for (let i = 0; i < n - 1; i++) {
    edges.push({ from: `n${i}`, to: `n${i + 1}` });
  }
  return { nodes, edges };
}

describe('GraphTrace', () => {
  it('truncates a node label too long for its circle instead of letting it overflow', () => {
    const { nodes, edges } = chain(6, true);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.gt-label'));
    expect(labels).toHaveLength(6);
    // Every rendered label's visible glyphs must fit the ~44px node circle at the class's
    // font-size (12px/700) — the old unconstrained render let "Node Alpha 0" bleed far wider.
    for (const node of labels) {
      expect(visibleText(node).length).toBeLessThanOrEqual(6);
    }
    // The full label is preserved via a native <title> tooltip, so nothing is silently lost.
    const titles = Array.from(container.querySelectorAll('text.gt-label title')).map(
      (t) => t.textContent,
    );
    expect(titles).toContain('Node Alpha 0');
  });

  it('leaves a short node label untouched and adds no tooltip', () => {
    const { nodes, edges } = chain(3, false);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.gt-label'));
    expect(labels.map((n) => visibleText(n))).toEqual(['0', '1', '2']);
    expect(container.querySelector('text.gt-label title')).toBeNull();
  });

  it('places all nodes within the fixed stage viewBox at a higher node count', () => {
    const { nodes, edges } = chain(12, true);
    const { container } = render(
      <GraphTrace
        title="Traversal"
        nodes={nodes}
        edges={edges}
        steps={[{ caption: 'Start', current: 'n0' }]}
      />,
    );
    const svg = container.querySelector('svg.gt-svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const circles = Array.from(container.querySelectorAll('circle.gt-node'));
    expect(circles).toHaveLength(12);
    for (const c of circles) {
      const cx = Number(c.getAttribute('cx'));
      const cy = Number(c.getAttribute('cy'));
      const r = Number(c.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(vbW);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(vbH);
    }
  });
});
