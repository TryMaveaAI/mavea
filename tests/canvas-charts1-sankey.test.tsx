import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sankey } from '../src/canvas/blocks/charts1/Sankey';
import type { SankeyLink, SankeyNode } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a real bug: the gap between stacked nodes in a Sankey layer was a
// hardcoded 14px, so a layer with many nodes (well beyond the ~3-node demo fixture) packed its
// bars past the chart's vertical budget instead of compressing to fit — and a sparse layer never
// got to use the leftover room, even when a neighboring dense layer left plenty of slack.

const H = 300; // must track Sankey.tsx's internal H — chart is fixed-viewBox, not measured live.

function chain(n: number): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const nodes: SankeyNode[] = [{ id: 'src', label: 'Source', layer: 0 }];
  const links: SankeyLink[] = [];
  for (let i = 0; i < n; i++) {
    const id = `t${i}`;
    nodes.push({ id, label: `Target ${i}`, layer: 1 });
    links.push({ source: 'src', target: id, value: 10 });
  }
  return { nodes, links };
}

/** Bars in the rightmost column (the stacked layer under test), top-to-bottom. */
function targetBars(container: HTMLElement) {
  const allBars = Array.from(container.querySelectorAll<SVGRectElement>('svg > g rect')).map(
    (r) => ({
      x: Number(r.getAttribute('x')),
      y: Number(r.getAttribute('y')),
      h: Number(r.getAttribute('height')),
    }),
  );
  const targetX = Math.max(...allBars.map((b) => b.x));
  return allBars.filter((b) => b.x === targetX).sort((a, b) => a.y - b.y);
}

describe('Sankey', () => {
  it.each([3, 8, 15])(
    'stacks %i nodes in a layer without overlap or overflowing the chart height',
    (n) => {
      const { nodes, links } = chain(n);
      const { container } = render(<Sankey title="Flow" nodes={nodes} links={links} />);
      const bars = targetBars(container);
      expect(bars).toHaveLength(n);

      // No bar may start before the previous one ends — that's the illegible-overlap failure mode
      // the fixed 14px gap couldn't prevent once node count outgrew the chart's height budget.
      for (let i = 1; i < bars.length; i++) {
        expect(bars[i].y).toBeGreaterThanOrEqual(bars[i - 1].y + bars[i - 1].h);
      }
      // The whole stack must stay within the chart's fixed viewBox height.
      const last = bars[bars.length - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(H);
    },
  );

  it('gives a sparse layer more breathing room than a dense neighbor leaves as slack', () => {
    // Layer 0 has one source; layer 1 has two heavy targets (sparse); layer 2 fans each of
    // those out into many thin leaves (dense) — same total throughput, wildly different counts.
    const nodes: SankeyNode[] = [
      { id: 'src', label: 'Source', layer: 0 },
      { id: 'a', label: 'A', layer: 1 },
      { id: 'b', label: 'B', layer: 1 },
    ];
    const links: SankeyLink[] = [
      { source: 'src', target: 'a', value: 50 },
      { source: 'src', target: 'b', value: 50 },
    ];
    for (let i = 0; i < 10; i++) {
      const id = `leaf${i}`;
      nodes.push({ id, label: `Leaf ${i}`, layer: 2 });
      links.push({ source: i < 5 ? 'a' : 'b', target: id, value: 10 });
    }
    const { container } = render(<Sankey title="Flow" nodes={nodes} links={links} />);

    // The sparse middle layer (A, B) — isolate it by its x, which sits strictly between the
    // source column and the dense leaf column.
    const allBars = Array.from(container.querySelectorAll<SVGRectElement>('svg > g rect')).map(
      (r) => ({
        x: Number(r.getAttribute('x')),
        y: Number(r.getAttribute('y')),
        h: Number(r.getAttribute('height')),
      }),
    );
    const xs = [...new Set(allBars.map((b) => b.x))].sort((a, b) => a - b);
    const midX = xs[1];
    const sparse = allBars.filter((b) => b.x === midX).sort((a, b) => a.y - b.y);
    expect(sparse).toHaveLength(2);

    const gap = sparse[1].y - (sparse[0].y + sparse[0].h);
    // With only two bars sharing the same track budget the 10-leaf layer needs, the leftover
    // space should distribute into a gap well beyond the old hardcoded 14px.
    expect(gap).toBeGreaterThan(14);

    // And the dense leaf layer still doesn't overlap or overflow.
    const dense = targetBars(container);
    expect(dense).toHaveLength(10);
    for (let i = 1; i < dense.length; i++) {
      expect(dense[i].y).toBeGreaterThanOrEqual(dense[i - 1].y + dense[i - 1].h);
    }
    const last = dense[dense.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(H);
  });

  it('does not overflow when a fan-out layer hits the per-node height floor', () => {
    // A hub with high per-node throughput sets a scale too aggressive for a later layer of many
    // low-value leaves: each leaf's raw height rounds under the 8px floor, inflating that layer's
    // total past the track budget. A gap that only ever grows (never shrinks below MIN_GAP) adds
    // fixed overflow on top of that instead of absorbing it.
    const nodes: SankeyNode[] = [
      { id: 'src', label: 'Source', layer: 0 },
      { id: 'hub', label: 'Hub', layer: 1 },
    ];
    const links: SankeyLink[] = [{ source: 'src', target: 'hub', value: 20 }];
    for (let i = 0; i < 20; i++) {
      const id = `leaf${i}`;
      nodes.push({ id, label: `Leaf ${i}`, layer: 2 });
      links.push({ source: 'hub', target: id, value: 1 });
    }
    const { container } = render(<Sankey title="Flow" nodes={nodes} links={links} />);
    const bars = targetBars(container);
    expect(bars).toHaveLength(20);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].y).toBeGreaterThanOrEqual(bars[i - 1].y + bars[i - 1].h);
    }
    const last = bars[bars.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(H);
  });
});
