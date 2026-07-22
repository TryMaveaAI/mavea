import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LatencyDist } from '../src/canvas/blocks/charts1/LatencyDist';
import type { LatencyBin } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a bug found by audit: percentile marker labels (p50/p90/p95/p99)
// were positioned with a fixed `y = PAD.t - 16 + (i % 2) * 11` two-row formula that alternated
// rows by array index alone. When the tail clusters — p90/p95/p99 all landing within a few
// pixels of each other near the right edge, which is exactly what a long-tail latency
// distribution looks like — index-based alternation could still drop two labels in the same
// row only ~18px apart (less than a "pXX" glyph's width), overlapping illegibly. The fix stacks
// labels by measured horizontal (pixel) proximity, recursing into a third/fourth row once a row
// fills up, so no two same-row labels can ever land closer than the label-width budget.

function bins(count: number): LatencyBin[] {
  // A generic staircase histogram wider than any demo fixture (perf.ts ships 9 bins) — the
  // marker-stacking fix shouldn't care about bin count, but this also guards bin rendering
  // (width/positioning) doesn't collapse or overlap at a larger count.
  const width = 600 / count;
  return Array.from({ length: count }, (_, i) => ({
    from: Math.round(i * width),
    to: Math.round((i + 1) * width),
    count: Math.max(10, 1000 - i * (900 / count)),
  }));
}

describe('LatencyDist', () => {
  it('stacks a tight tail cluster (p90/p95/p99 within a few px) across rows with no overlap', () => {
    // The exact shape that collided under the old i%2 formula: p90/p95/p99 bunched near the
    // right edge of a long tail, only ~10-20px apart on screen.
    const { container } = render(
      <LatencyDist
        title="API latency"
        unit="ms"
        bins={[
          { from: 0, to: 100, count: 500 },
          { from: 100, to: 200, count: 900 },
          { from: 200, to: 500, count: 300 },
        ]}
        p50={120}
        p90={470}
        p95={480}
        p99={488}
      />,
    );

    const groups = Array.from(container.querySelectorAll('.c1-ld-pct'));
    expect(groups).toHaveLength(4);

    const labels = groups.map((g) => {
      const text = g.querySelector('text')!;
      return {
        label: text.textContent,
        x: Number(text.getAttribute('x')),
        y: Number(text.getAttribute('y')),
      };
    });

    // Group labels by their printed row (the y coordinate) and confirm no two labels sharing a
    // row sit closer together than a "pXX" glyph can render without touching.
    const byRow = new Map<number, { label: string | null; x: number }[]>();
    for (const l of labels) {
      const row = byRow.get(l.y) ?? [];
      row.push({ label: l.label, x: l.x });
      byRow.set(l.y, row);
    }
    for (const [y, row] of byRow) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - sorted[i - 1].x;
        expect(
          gap,
          `labels "${sorted[i - 1].label}" and "${sorted[i].label}" share row y=${y} only ${gap}px apart`,
        ).toBeGreaterThanOrEqual(20);
      }
    }

    // The cluster forces at least a third row — proof the fix isn't just a wider two-row gap.
    expect(byRow.size).toBeGreaterThanOrEqual(3);
  });

  it.each([3, 9, 16])(
    'renders %i bins with no illegible marker overlap at a spread-out fixture',
    (n) => {
      const { container } = render(
        <LatencyDist
          title="API latency"
          unit="ms"
          bins={bins(n)}
          p50={100}
          p90={300}
          p95={450}
          p99={580}
          slo={400}
        />,
      );

      const rects = Array.from(container.querySelectorAll<SVGRectElement>('.c1-tm-cell rect'));
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect(Number(r.getAttribute('width'))).toBeGreaterThan(0);
      }

      const texts = Array.from(container.querySelectorAll('.c1-ld-pct text'));
      expect(texts).toHaveLength(4);
      const xs = texts.map((t) => Number(t.getAttribute('x'))).sort((a, b) => a - b);
      const ys = texts.map((t) => Number(t.getAttribute('y')));
      for (let i = 1; i < texts.length; i++) {
        // Any two labels close enough in x to plausibly collide must differ in y (a different row).
        if (Math.abs(xs[i] - xs[i - 1]) < 20) {
          expect(ys[i]).not.toBe(ys[i - 1]);
        }
      }
    },
  );

  it('renders four distinct percentile rows evenly spread without clustering', () => {
    const { container } = render(
      <LatencyDist
        title="API latency"
        unit="ms"
        bins={[
          { from: 0, to: 100, count: 400 },
          { from: 100, to: 300, count: 600 },
          { from: 300, to: 600, count: 200 },
        ]}
        p50={50}
        p90={200}
        p95={350}
        p99={550}
      />,
    );
    // Widely-spaced percentiles should all fit on the same top row — the fix must not
    // over-stack labels that were never actually crowded.
    const texts = Array.from(container.querySelectorAll('.c1-ld-pct text'));
    expect(texts).toHaveLength(4);
    const ys = new Set(texts.map((t) => t.getAttribute('y')));
    expect(ys.size).toBe(1);
  });
});
