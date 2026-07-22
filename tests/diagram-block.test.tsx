import { render } from '@testing-library/react';
import { DiagramFlow } from '../src/canvas/blocks/diagrams/DiagramFlow';
import type { DiagramFlowProps } from '../src/canvas/blocks/diagrams/types';

// The diagram primitive renders model-supplied nodes/edges as an SVG figure. These tests
// lock the contract the Live path depends on: every node draws, every edge whose endpoints
// both exist draws a connector (and a dangling edge is silently dropped, never crashes), and
// the per-node label/sub text never share a baseline (the overlap bug we fixed). jsdom has no
// SVG text metrics, so we assert on the y ATTRIBUTES the layout computes, not painted boxes.

function renderDiagram(props: Partial<DiagramFlowProps> = {}) {
  const full: DiagramFlowProps = {
    title: 'Test diagram',
    nodes: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    ...props,
  };
  return render(
    <svg>
      <DiagramFlow {...full} />
    </svg>,
  );
}

describe('DiagramFlow', () => {
  it('renders one labelled node per node', () => {
    const { container } = renderDiagram();
    const labels = [...container.querySelectorAll('.dg-node-label')].map((n) => n.textContent);
    expect(labels).toHaveLength(3);
    expect(labels.join(' ')).toContain('Alpha');
    expect(labels.join(' ')).toContain('Gamma');
  });

  it('draws a connector for every edge whose endpoints both exist', () => {
    const { container } = renderDiagram();
    // each edge group holds exactly one path
    const edgePaths = container.querySelectorAll('.dg-edge path');
    expect(edgePaths).toHaveLength(2);
  });

  it('silently drops an edge that references a missing node (never throws)', () => {
    const { container } = renderDiagram({
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'does-not-exist' },
      ],
    });
    expect(container.querySelectorAll('.dg-edge path')).toHaveLength(1);
  });

  it('keeps a node label and its sub on separate baselines (no overlap)', () => {
    const { container } = renderDiagram({
      nodes: [{ id: 'a', label: 'Isothermal expansion', sub: 'absorbs Qh' }],
      edges: [],
    });
    // Both label and sub carry their y on the tspan (each line can render at its own fitted size).
    const labelTspans = [...container.querySelectorAll('.dg-node-label tspan')];
    const subTspan = container.querySelector('.dg-node-sub tspan');
    expect(labelTspans.length).toBeGreaterThan(0);
    expect(subTspan).not.toBeNull();
    const lastLabelY = Math.max(...labelTspans.map((t) => Number(t.getAttribute('y'))));
    const subY = Number(subTspan!.getAttribute('y'));
    // the sub sits strictly below the last label line
    expect(subY).toBeGreaterThan(lastLabelY + 8);
  });

  it('shrinks a long label to fit rather than ellipsizing it', () => {
    const label = 'A node with an extremely long label that should wrap not clip';
    const { container } = renderDiagram({
      nodes: [{ id: 'a', label }],
      edges: [],
    });
    // The full text always renders — no ellipsis anywhere...
    expect(container.querySelector('.dg-node-label')!.textContent).not.toContain('…');
    // ...it just wraps across more lines instead of being cut off...
    expect(container.querySelectorAll('.dg-node-label tspan').length).toBeGreaterThan(1);
    // ...and the complete, unwrapped label survives in the node's <title>.
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toContain(label);
  });

  it('emits an arrowhead marker per distinct edge tint actually used', () => {
    const { container } = renderDiagram({
      edges: [
        { from: 'a', to: 'b', kind: 'good' },
        { from: 'b', to: 'c', kind: 'good' },
        { from: 'a', to: 'c', kind: 'warn' },
      ],
    });
    // 'good' + 'warn' = 2 markers, not 3 (deduped by tint)
    expect(container.querySelectorAll('marker')).toHaveLength(2);
  });

  it('renders without an edges/nodes mismatch crashing on an empty graph', () => {
    expect(() => renderDiagram({ nodes: [], edges: [] })).not.toThrow();
  });
});
