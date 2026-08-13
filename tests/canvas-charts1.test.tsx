import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Boxplot } from '../src/canvas/blocks/charts1/Boxplot';
import { CapTable } from '../src/canvas/blocks/charts1/CapTable';
import { DistributionCurve } from '../src/canvas/blocks/charts1/DistributionCurve';
import { Funnel } from '../src/canvas/blocks/charts1/Funnel';
import { Histogram } from '../src/canvas/blocks/charts1/Histogram';
import { LatencyDist } from '../src/canvas/blocks/charts1/LatencyDist';
import { LifeWheel } from '../src/canvas/blocks/charts1/LifeWheel';
import { Network } from '../src/canvas/blocks/charts1/Network';
import { Quadrant } from '../src/canvas/blocks/charts1/Quadrant';
import { Radar } from '../src/canvas/blocks/charts1/Radar';
import { Sankey } from '../src/canvas/blocks/charts1/Sankey';
import { StemLeaf } from '../src/canvas/blocks/charts1/StemLeaf';
import { Streamgraph } from '../src/canvas/blocks/charts1/Streamgraph';
import { Sunburst } from '../src/canvas/blocks/charts1/Sunburst';
import { Venn } from '../src/canvas/blocks/charts1/Venn';
import { ViolinPlot } from '../src/canvas/blocks/charts1/ViolinPlot';
import { Waterfall } from '../src/canvas/blocks/charts1/Waterfall';
import type {
  BoxGroup,
  CapHolder,
  FunnelStage,
  HistogramBin,
  LatencyBin,
  LifeDomain,
  NetworkEdge,
  NetworkNode,
  QuadrantItem,
  RadarSeries,
  SankeyLink,
  SankeyNode,
  StreamSeries,
  SunburstNode,
  VennOverlap,
  VennSet,
  ViolinGroup,
  WaterfallStep,
} from '../src/canvas/blocks/charts1/types';

// Regression coverage for a bug found from a live screenshot: Boxplot's bottom group labels
// sat at a fixed font-size and relied on each slot narrowing as the group count grew, so past
// ~4 groups the (unchanged) label width outpaced its slot and neighboring labels overlapped.
describe('Boxplot', () => {
  function groups(n: number): BoxGroup[] {
    const labels = [
      'Morning',
      'Afternoon',
      'Evening',
      'Overnight',
      'Pre-workout',
      'Post-workout',
      'Fasting',
      'Post-meal',
      'Weekend',
      'Weekday',
    ];
    return Array.from({ length: n }, (_, i) => ({
      label: labels[i] ?? `Group ${i + 1}`,
      min: 100 + i,
      q1: 110 + i,
      median: 118 + i,
      q3: 124 + i * 2, // widening IQR per index so the "widest IQR" group is deterministic
      max: 130 + i * 2,
    }));
  }

  it.each([2, 4, 6, 10])('renders %i group(s) with no illegible label overlap', (n) => {
    const { container } = render(<Boxplot title="Blood pressure" unit="mmHg" groups={groups(n)} />);
    const texts = Array.from(container.querySelectorAll('.c1-bp-group text'));
    expect(texts).toHaveLength(n);

    // At small counts labels stay upright and reasonably sized; once the slot per group gets
    // tight, the font shrinks and — at 8+ groups — rotates so labels read along the slot
    // instead of colliding across it.
    const sizes = texts.map((t) => Number(t.getAttribute('font-size')));
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(7.5);
      expect(size).toBeLessThanOrEqual(10.5);
    }
    if (n >= 8) {
      for (const t of texts) {
        expect(t.getAttribute('transform')).toMatch(/rotate\(-45/);
      }
    } else {
      for (const t of texts) {
        expect(t.getAttribute('transform')).toBeNull();
      }
    }

    // Every full label survives somewhere (as a <title> tooltip if visually truncated), so
    // hovering/inspecting never loses information even when the on-axis text is shortened.
    const fullLabels = groups(n).map((g) => g.label);
    const titles = Array.from(container.querySelectorAll('.c1-bp-group text title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(fullLabels);
  });

  it('marks the group with the widest interquartile range, not always the first group', () => {
    const { container } = render(<Boxplot title="Spread" groups={groups(5)} />);
    // groups(5) is built with a strictly widening q3 - q1, so the last group (index 4) has the
    // widest IQR — the old code always marked index 0 regardless of the data.
    const marked = container.querySelectorAll(".c1-bp-group line[data-mark='circle']");
    expect(marked).toHaveLength(1);
    const allMedianLines = Array.from(container.querySelectorAll('.c1-bp-group')).map((g) =>
      g.querySelector("line[stroke-width='2.4']"),
    );
    expect(allMedianLines[4]).toBe(marked[0]);
  });

  it('gives every group a staggered entrance index for the shared fade-rise animation', () => {
    const { container } = render(<Boxplot title="Spread" groups={groups(4)} />);
    const groupEls = Array.from(container.querySelectorAll('.c1-bp-group'));
    expect(groupEls).toHaveLength(4);
    groupEls.forEach((el, i) => {
      expect((el as HTMLElement).style.getPropertyValue('--i')).toBe(String(i));
    });
  });
});

// Regression coverage: CapTable's stacked ownership bar and ledger must stay legible and
// correctly proportioned well past the 5-holder demo fixture — a cap table with a dozen+
// rounds/holders is a realistic case (seed, several angels, a large ESOP, multiple priced
// rounds), and the segment/label math must not degrade as the holder count grows.
describe('CapTable', () => {
  function holders(n: number): CapHolder[] {
    // A skewed mix: two large holders, then a long tail of small ones — the shape that would
    // expose any label-crowding or width-rollup bug in the stacked bar.
    return Array.from({ length: n }, (_, i) => ({
      name: `Holder ${i + 1}`,
      shares: i < 2 ? 2000000 : 40000,
      class: i < 2 ? 'Preferred' : 'Common',
    }));
  }

  it('renders one bar segment and one ledger row per holder well beyond the demo fixture size', () => {
    const n = 14;
    const { container } = render(<CapTable title="Cap table" holders={holders(n)} />);
    expect(container.querySelectorAll('.c1-cap-seg')).toHaveLength(n);
    expect(container.querySelectorAll('.c1-cap-table tbody tr')).toHaveLength(n);
  });

  it('sizes bar segments by rolled-up share of the total, summing to a full bar', () => {
    const n = 14;
    const { container } = render(<CapTable title="Cap table" holders={holders(n)} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>('.c1-cap-seg'));
    const widths = segs.map((s) => parseFloat(s.style.width));
    // Every segment is a finite, non-negative share of the bar and the whole set accounts
    // for (approximately) the full 100% width — no segment silently drops off or overflows.
    widths.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    });
    expect(widths.reduce((s, w) => s + w, 0)).toBeCloseTo(100, 5);
  });

  it('suppresses the inline % label on thin segments instead of letting text overlap', () => {
    // With 14 holders and a skewed split, most segments fall well under the 9% width
    // threshold where an inline label would no longer fit — those must render no label text,
    // while the two large holders (each far above 9%) must still show theirs.
    const { container } = render(<CapTable title="Cap table" holders={holders(14)} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>('.c1-cap-seg'));
    const labeled = segs.filter((s) => s.querySelector('.c1-cap-seg-pct'));
    const unlabeled = segs.filter((s) => !s.querySelector('.c1-cap-seg-pct'));
    expect(labeled.length).toBeGreaterThan(0);
    expect(unlabeled.length).toBeGreaterThan(0);
    labeled.forEach((s) => {
      expect(parseFloat(s.style.width)).toBeGreaterThanOrEqual(9);
    });
    unlabeled.forEach((s) => {
      expect(parseFloat(s.style.width)).toBeLessThan(9);
    });
  });

  it('keeps every ledger percentage finite and rolled up against an explicit totalShares base', () => {
    // An explicit totalShares smaller than the raw holder sum (e.g. a partial cap table)
    // must not blow up percentages past what the base allows to go negative or NaN.
    const n = 20;
    const { container } = render(
      <CapTable title="Cap table" holders={holders(n)} totalShares={5000000} />,
    );
    const pctCells = Array.from(
      container.querySelectorAll<HTMLElement>('.c1-cap-table tbody td.num:last-child'),
    );
    expect(pctCells).toHaveLength(n);
    pctCells.forEach((td) => {
      const pct = parseFloat(td.textContent || '');
      expect(Number.isFinite(pct)).toBe(true);
      expect(pct).toBeGreaterThanOrEqual(0);
    });
  });
});

// Regression coverage for a real bug: every marker label was pinned to the same fixed y
// (PAD.t - 2), so two or more markers placed near each other on the x-axis rendered their
// labels on top of one another. This is a demo-fixture blind spot — the shipped topic data
// only ever exercises a single marker.
describe('DistributionCurve', () => {
  function labelYs(container: HTMLElement): number[] {
    return Array.from(container.querySelectorAll('.c1-dist-mklbl')).map((el) =>
      Number(el.getAttribute('y')),
    );
  }

  it('renders a single marker label at the legacy top position (no regression for the common case)', () => {
    const { container } = render(
      <DistributionCurve
        title="Score distribution"
        mean={74}
        sd={11}
        markers={[{ x: 62, label: 'You' }]}
      />,
    );
    const ys = labelYs(container);
    expect(ys).toHaveLength(1);
    expect(ys[0]).toBe(12); // PAD.t (14) - 2
  });

  it('staggers label rows so nearby markers never collide, larger than the demo fixture', () => {
    // Five markers packed close together on the x-axis — the shape that collapsed to one row
    // of overlapping text under the old fixed-y placement.
    const { container } = render(
      <DistributionCurve
        title="Cluster of markers"
        mean={0}
        sd={1}
        markers={[
          { x: -0.3, label: 'A' },
          { x: -0.15, label: 'B' },
          { x: 0, label: 'C' },
          { x: 0.15, label: 'D' },
          { x: 0.3, label: 'E' },
        ]}
      />,
    );
    const ys = labelYs(container);
    expect(ys).toHaveLength(5);
    // Not every label crammed onto the single legacy y — at least one row break happened.
    expect(new Set(ys).size).toBeGreaterThan(1);
    // No two labels share an identical y among markers packed within one row's x-gap — every
    // row boundary must actually separate its neighbors vertically.
    for (let i = 0; i < ys.length; i++) {
      for (let j = i + 1; j < ys.length; j++) {
        if (ys[i] === ys[j]) {
          // Same row is only safe if these two are not adjacent on the x-axis — assert instead
          // that identical rows never occur for this tightly packed fixture.
          throw new Error(`markers ${i} and ${j} share row y=${ys[i]}, expected staggering`);
        }
      }
    }
  });

  it('keeps every label within the SVG viewBox regardless of marker count', () => {
    const markers = Array.from({ length: 8 }, (_, i) => ({
      x: -3.5 + i * 1,
      label: `M${i}`,
    }));
    const { container } = render(
      <DistributionCurve title="Many markers" mean={0} sd={1} markers={markers} />,
    );
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , , viewH] = viewBox;
    const ys = labelYs(container);
    expect(ys).toHaveLength(8);
    for (const y of ys) {
      expect(y).toBeGreaterThan(-viewH); // sane bound, no wild negative runaway
      expect(y).toBeLessThan(viewH * 1.5); // sane bound, no wild overflow below the card
    }
  });

  it('renders no marker labels when no markers are given', () => {
    const { container } = render(
      <DistributionCurve title="Plain curve" mean={0} sd={1} markers={[]} />,
    );
    expect(container.querySelectorAll('.c1-dist-mklbl')).toHaveLength(0);
  });
});

// Regression coverage for Funnel's row-count scaling: the demo fixture only ever exercises
// ~5 stages, so a monotonically-shrinking-width bug or a row-height/row-count mismatch (rows
// overlapping instead of stacking) could hide behind that one fixture size indefinitely.
describe('Funnel', () => {
  function stages(n: number): FunnelStage[] {
    // Each stage keeps ~60% of the prior one, same decay shape as the real sales-funnel fixture,
    // so rollup sizing (row width ∝ value / top value) has real variation to get wrong.
    return Array.from({ length: n }, (_, i) => ({
      label: `Stage ${i + 1}`,
      value: Math.round(10000 * 0.6 ** i),
    }));
  }

  it.each([1, 5, 9])('renders %i stage(s) as one row each, sized and stacked correctly', (n) => {
    const { container } = render(<Funnel title="Pipeline" stages={stages(n)} />);
    // Scope to the chart SVG specifically — the eyebrow icon is also an <svg>, and would
    // otherwise be picked up by an unqualified `container.querySelector('svg')`.
    const svg = container.querySelector<SVGSVGElement>('svg[role="img"]')!;
    const rows = Array.from(svg.querySelectorAll<SVGGElement>(':scope > g'));
    expect(rows).toHaveLength(n);

    // Rollup sizing: each row's rect width must track its value relative to the top stage —
    // strictly non-increasing down the funnel since the fixture values strictly decrease.
    const widths = rows.map((g) => Number(g.querySelector('rect')?.getAttribute('width')));
    for (const w of widths) {
      expect(w).toBeGreaterThan(0);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
    }

    // No illegible overlap: rows stack with a fixed pitch (ROW_H + GAP), so consecutive rects
    // must never share y-territory regardless of how many stages are rendered.
    const rects = rows.map((g) => g.querySelector('rect')!);
    const tops = rects.map((r) => Number(r.getAttribute('y')));
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1] + heights[i - 1]);
    }

    // The viewBox height must grow with the stage count instead of staying pinned to a fixed
    // size that would crush later rows into each other.
    const [, , , vbHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(vbHeight).toBeGreaterThanOrEqual(tops[n - 1] + heights[n - 1]);
  });

  it('stages each row for a sequential center-out entrance, keyed by index', () => {
    const { container } = render(<Funnel title="Pipeline" stages={stages(6)} />);
    const svg = container.querySelector<SVGSVGElement>('svg[role="img"]')!;
    const rows = Array.from(svg.querySelectorAll<SVGGElement>(':scope > g.c1-tm-cell'));
    expect(rows).toHaveLength(6);
    rows.forEach((g, i) => {
      expect(g.style.getPropertyValue('--i')).toBe(String(i));
      // transformOrigin must be set (center-out bloom), not left at the SVG default corner.
      expect(g.style.transformOrigin).not.toBe('');
    });
  });
});

// Regression coverage mirroring the TamSam/Treemap audit: verify Histogram keeps every bar
// legible and correctly rolled-up as the bin count grows well past the demo fixture size,
// since a per-item layout that only looks right at a small fixture is exactly the class of
// bug those two siblings had (illegible overlap, and zero-width cells from bad rollup math).
describe('Histogram', () => {
  function bins(n: number): HistogramBin[] {
    return Array.from({ length: n }, (_, i) => ({
      x0: i * 10,
      x1: (i + 1) * 10,
      count: ((i * 7) % 13) + 1, // varied, always positive
    }));
  }

  it.each([3, 12, 40])('renders %i bins as non-overlapping, positive-width bars', (n) => {
    const { container } = render(<Histogram title="Distribution" bins={bins(n)} />);
    const rects = Array.from(container.querySelectorAll<SVGRectElement>('svg > rect'));
    expect(rects).toHaveLength(n);

    // Every bar must have a strictly positive width — a squashed-to-zero bar is illegible.
    for (const r of rects) {
      expect(Number(r.getAttribute('width'))).toBeGreaterThan(0);
    }

    // Bars must be laid out left-to-right in bin order with no horizontal overlap between
    // neighbours (a small gap is fine and expected from the inter-bar padding).
    const spans = rects.map((r) => {
      const x = Number(r.getAttribute('x'));
      const w = Number(r.getAttribute('width'));
      return [x, x + w] as const;
    });
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.01);
    }

    // The salient (mode) bar is marked exactly once regardless of how many bins are drawn.
    expect(container.querySelectorAll('rect[data-mark="circle"]')).toHaveLength(1);
  });

  it('scales bar height by count relative to the tallest bin, not a fixed pixel size', () => {
    const tallBins: HistogramBin[] = [
      { x0: 0, x1: 10, count: 100 },
      { x0: 10, x1: 20, count: 25 },
      { x0: 20, x1: 30, count: 1 },
    ];
    const { container } = render(<Histogram title="Skewed" bins={tallBins} />);
    const rects = Array.from(container.querySelectorAll<SVGRectElement>('svg > rect'));
    expect(rects).toHaveLength(3);
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    // Tallest count draws the tallest bar; smallest count draws the shortest.
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  it('keeps the axis tick count bounded (nice-step rollup) no matter how tall the peak bin is', () => {
    const { container } = render(
      <Histogram title="Big peak" bins={[{ x0: 0, x1: 1, count: 987654 }]} />,
    );
    // niceTicks caps around a handful of round intervals — never one tick per unit of count.
    const tickTexts = container.querySelectorAll('svg > g > text.tab-num');
    expect(tickTexts.length).toBeLessThan(10);
  });
});

// Regression coverage for a bug found by audit: percentile marker labels (p50/p90/p95/p99)
// were positioned with a fixed `y = PAD.t - 16 + (i % 2) * 11` two-row formula that alternated
// rows by array index alone. When the tail clusters — p90/p95/p99 all landing within a few
// pixels of each other near the right edge, which is exactly what a long-tail latency
// distribution looks like — index-based alternation could still drop two labels in the same
// row only ~18px apart (less than a "pXX" glyph's width), overlapping illegibly. The fix stacks
// labels by measured horizontal (pixel) proximity, recursing into a third/fourth row once a row
// fills up, so no two same-row labels can ever land closer than the label-width budget.
describe('LatencyDist', () => {
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

// Regression coverage for a real bug: LifeWheel's on-spoke score labels used a fixed
// dx={3} dy={-4} offset regardless of where the spoke sat around the wheel, so on a
// crowded wheel (16+ domains) labels on the left side got shoved further into their
// neighbor instead of away from it, and the score node right at the top could get its
// label offset sideways past the card edge.
describe('LifeWheel', () => {
  function domains(n: number): LifeDomain[] {
    return Array.from({ length: n }, (_, i) => ({
      label: `Domain ${i + 1}`,
      score: 3 + (i % 8),
    }));
  }

  it('renders one score label per domain even on a crowded (16-item) wheel', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(16)} />);
    const scores = container.querySelectorAll('.c1-lw-score');
    expect(scores).toHaveLength(16);
  });

  it('offsets score labels away from center instead of a fixed dx/dy — left- and right-side spokes diverge', () => {
    // Four domains: right (angle 90°), bottom (180°), left (270°), top (0°/360° wraps to i=0).
    // With even spacing across N=4: i=0 → 0° (top), i=1 → 90° (right), i=2 → 180° (bottom),
    // i=3 → 270° (left).
    const { container } = render(<LifeWheel title="Balance" domains={domains(4)} />);
    const scores = Array.from(container.querySelectorAll('.c1-lw-score'));
    expect(scores).toHaveLength(4);

    const rightLabel = scores[1]; // spoke pointing right of center
    const leftLabel = scores[3]; // spoke pointing left of center

    const rightDx = Number(rightLabel.getAttribute('dx'));
    const leftDx = Number(leftLabel.getAttribute('dx'));

    // The old fixed dx={3} pushed every label the same direction regardless of side, which
    // is exactly what crowds labels on the left half of the wheel into their spokes/neighbors.
    // A correct fix mirrors the sign so left-side labels point further left, right-side further right.
    expect(rightDx).toBeGreaterThan(0);
    expect(leftDx).toBeLessThan(0);
    expect(rightLabel.getAttribute('text-anchor')).toBe('start');
    expect(leftLabel.getAttribute('text-anchor')).toBe('end');
  });

  it('anchors a near-vertical spoke score label to the middle instead of drifting sideways', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(4)} />);
    const scores = Array.from(container.querySelectorAll('.c1-lw-score'));
    const topLabel = scores[0]; // spoke pointing straight up (x ≈ CX)

    expect(topLabel.getAttribute('text-anchor')).toBe('middle');
    expect(Number(topLabel.getAttribute('dx'))).toBe(0);
  });

  it('renders the legend rollup with matching score count regardless of item count', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(20)} />);
    expect(container.querySelectorAll('.c1-lw-leg')).toHaveLength(20);
    expect(container.querySelectorAll('.c1-lw-score')).toHaveLength(20);
  });

  // The wheel's in-figure type is authored in SVG user units, so what reaches the reader is
  // `authored size × the figure's rendered width ÷ its viewBox width`. Sharing the radar's
  // narrower 42cqi slot put a 444-unit-wide viewBox on screen at ~320px, shrinking every rim
  // label to ~7px — well under the library's 9px legibility floor. The fix widens the figure
  // rather than the type, so these two halves have to stay in step.
  it('keeps in-figure type at or above the size the widened figure is sized around', () => {
    const { container } = render(<LifeWheel title="Balance" domains={domains(8)} />);
    const sizes = Array.from(container.querySelectorAll('text')).map((t) =>
      Number(t.getAttribute('font-size')),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
  });

  it('gives the wheel its own figure width, and still honours the narrow-card cap', () => {
    const css = readFileSync(join(__dirname, '../src/canvas/blocks/charts1/styles.css'), 'utf8');
    // A `.c1-radar.c1-lw` override outranks the shared `.c1-radar` rules on the same element —
    // including the narrow-card one — so the narrow cap has to be restated for the wheel or it
    // silently stops applying and the figure overruns a phone-width card.
    const overrides = Array.from(css.matchAll(/\.c1-radar\.c1-lw\s*\{([^}]*)\}/g));
    expect(overrides).toHaveLength(2);
    expect(overrides.every(([, body]) => /max-width:/.test(body))).toBe(true);
    expect(/@media[^{]*max-width:\s*560px[^{]*\{[^@]*\.c1-radar\.c1-lw/.test(css)).toBe(true);
  });
});

// Regression coverage for Network's entrance animation: `.c1-network-node` / `.c1-network-edge`
// (and their keyframes) already existed centrally in charts1/styles.css, but the component never
// applied those classes or set the `--i` stagger custom property, so nodes and edges popped in
// instantly instead of blooming in like every other charts1 sibling (TamSam's rings, Treemap's
// cells). This also checks the salient (highest-degree) node stays correctly marked at a node
// count well beyond the six-node demo fixture, since the hub can shift as edges are added.
describe('Network', () => {
  function nodes(n: number): NetworkNode[] {
    return Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, group: i % 4 }));
  }

  // A hub-and-spoke graph: n0 connects to everyone else, so it's unambiguously the highest-degree
  // (salient) node regardless of how many peripheral nodes are added.
  function hubEdges(n: number): NetworkEdge[] {
    return Array.from({ length: n - 1 }, (_, i) => ({ source: 'n0', target: `n${i + 1}` }));
  }

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

// Regression coverage for the Quadrant 2×2 matrix: the demo fixture only ever exercises 6 items
// spread across four cells (at most 2 per cell), so a cell that has to hold many more items than
// that — a plausible real answer, e.g. a long backlog triaged by impact/effort — needs to stay
// legible: every item groups into the right quadrant, no items are silently dropped, and the
// per-cell list keeps growing downward (flex column) rather than clipping or stacking on top of
// itself. Mirrors the sizing-audit style of canvas-tamsam-treemap.test.tsx and
// canvas-squarify.test.ts.
describe('Quadrant', () => {
  function heavyItems(n: number): QuadrantItem[] {
    const quadrants: QuadrantItem['quadrant'][] = [
      'topRight',
      'topLeft',
      'bottomLeft',
      'bottomRight',
    ];
    return Array.from({ length: n }, (_, i) => ({
      label: `Factor ${i + 1}`,
      quadrant: quadrants[i % quadrants.length],
      note: `note ${i + 1}`,
    }));
  }

  it('buckets a larger-than-demo item count into exactly the right cells with none dropped', () => {
    // 24 items (4x the 6-item demo fixture), evenly round-robined across the four quadrants.
    const items = heavyItems(24);
    const { container } = render(
      <Quadrant
        title="Backlog by impact vs. effort"
        xLabel="Effort →"
        yLabel="Impact →"
        topRight="High impact, high effort"
        topLeft="High impact, low effort"
        bottomLeft="Low impact, low effort"
        bottomRight="Low impact, high effort"
        items={items}
      />,
    );

    // Every item rendered exactly once — none dropped, none duplicated.
    const rows = container.querySelectorAll('.qd-item');
    expect(rows).toHaveLength(24);

    // Four cells total, one per quadrant, each holding its own share (6 apiece here) — grouping
    // is by quadrant, not render order, so a round-robin input still lands evenly.
    const cells = container.querySelectorAll('.qd-cell');
    expect(cells).toHaveLength(4);
    cells.forEach((cell) => {
      expect(cell.querySelectorAll('.qd-item')).toHaveLength(6);
    });
  });

  it('keeps an uneven split (one crowded cell, three sparse) legible with no overlap markers', () => {
    // Realistic skew: most factors land in one quadrant (e.g. "high effort, low impact" busywork).
    const items: QuadrantItem[] = [
      ...Array.from({ length: 14 }, (_, i) => ({
        label: `Busywork ${i + 1}`,
        quadrant: 'bottomRight' as const,
        note: 'low value',
      })),
      { label: 'Quick win', quadrant: 'topLeft' },
      { label: 'Big bet', quadrant: 'topRight' },
      { label: 'Table stakes', quadrant: 'bottomLeft' },
    ];

    const { container } = render(
      <Quadrant
        title="Skewed triage"
        items={items}
        topRight="A"
        topLeft="B"
        bottomLeft="C"
        bottomRight="D"
      />,
    );

    expect(container.querySelectorAll('.qd-item')).toHaveLength(17);

    // The crowded cell holds every one of its 14 items in a single flex column list — the
    // layout has no per-cell max-height that would clip or force overlap as the count grows.
    const lists = container.querySelectorAll('.qd-items');
    expect(lists).toHaveLength(4);
    const counts = Array.from(lists).map((ul) => ul.querySelectorAll('.qd-item').length);
    expect(counts.sort((a, b) => b - a)).toEqual([14, 1, 1, 1]);

    // Each item keeps its own label + note as distinct text nodes (no concatenation/overlap
    // of adjacent rows into one illegible blob).
    const labels = Array.from(container.querySelectorAll('.qd-item-label')).map(
      (el) => el.textContent,
    );
    expect(new Set(labels).size).toBe(17);
  });

  it('renders with no items at all without throwing (empty cells, not a crash)', () => {
    const { container } = render(<Quadrant title="Empty matrix" items={[]} />);
    expect(container.querySelectorAll('.qd-cell')).toHaveLength(4);
    expect(container.querySelectorAll('.qd-item')).toHaveLength(0);
  });
});

// Regression coverage for a real bug: Radar's axis labels used a fixed font size (13) and a
// fixed per-char width estimate with no awareness of axis count. Angular spacing between axes
// shrinks as 360°/n, so once there were ~12+ axes the fixed-size labels started overlapping
// each other around the ring — the font must shrink as axes get denser.
describe('Radar', () => {
  function axesAndSeries(n: number): { axes: string[]; series: RadarSeries[] } {
    const axes = Array.from({ length: n }, (_, i) => `Category ${i + 1}`);
    const series: RadarSeries[] = [
      { label: 'Series A', values: axes.map((_, i) => ((i * 7) % 10) + 1) },
    ];
    return { axes, series };
  }

  it('keeps the base label size for a normal (low-density) axis count', () => {
    const { axes, series } = axesAndSeries(6);
    const { container } = render(<Radar title="Skills" axes={axes} series={series} />);
    const texts = Array.from(container.querySelectorAll('.c1-radar text'));
    expect(texts).toHaveLength(6);
    texts.forEach((t) => expect(Number(t.getAttribute('font-size'))).toBe(13));
  });

  it('shrinks axis label font size as axis count grows past the density threshold', () => {
    const { axes, series } = axesAndSeries(16);
    const { container } = render(<Radar title="Dense" axes={axes} series={series} />);
    const texts = Array.from(container.querySelectorAll('.c1-radar text'));
    expect(texts).toHaveLength(16);
    const sizes = texts.map((t) => Number(t.getAttribute('font-size')));
    // Every label shrank below the base size...
    sizes.forEach((s) => expect(s).toBeLessThan(13));
    // ...but never below the legibility floor.
    sizes.forEach((s) => expect(s).toBeGreaterThanOrEqual(9));
  });

  it('shrinks progressively as more axes are added past the density threshold', () => {
    // The failure mode this guards: the old font size was a flat constant (13) regardless of
    // axis count, so a 12-axis radar and a 30-axis radar rendered identically crowded labels.
    // The fix must make the size a decreasing function of axis count beyond the threshold, not
    // just a single fixed "dense" size — so 16 axes and 24 axes are visibly different too.
    const sizeAt = (n: number) => {
      const { axes, series } = axesAndSeries(n);
      const { container } = render(<Radar title={`n=${n}`} axes={axes} series={series} />);
      return Number(container.querySelector('.c1-radar text')?.getAttribute('font-size'));
    };

    const s10 = sizeAt(10); // at/under threshold — untouched
    const s16 = sizeAt(16);
    const s24 = sizeAt(24);

    expect(s10).toBe(13);
    expect(s16).toBeLessThan(s10);
    expect(s24).toBeLessThan(s16);
  });

  it('grows the viewBox to keep dense labels inside the frame instead of clipping', () => {
    const { axes, series } = axesAndSeries(18);
    const { container } = render(<Radar title="Full ring" axes={axes} series={series} />);
    const svg = container.querySelector('.c1-radar');
    const viewBox = svg?.getAttribute('viewBox') ?? '';
    const [, , w, h] = viewBox.split(' ').map(Number);
    // Base box is 300x300 — a dense ring of labels should still fit in a sane, finite frame.
    expect(w).toBeGreaterThanOrEqual(300);
    expect(h).toBeGreaterThanOrEqual(300);
    expect(Number.isFinite(w)).toBe(true);
    expect(Number.isFinite(h)).toBe(true);
  });
});

// Regression coverage for a real bug: the gap between stacked nodes in a Sankey layer was a
// hardcoded 14px, so a layer with many nodes (well beyond the ~3-node demo fixture) packed its
// bars past the chart's vertical budget instead of compressing to fit — and a sparse layer never
// got to use the leftover room, even when a neighboring dense layer left plenty of slack.
describe('Sankey', () => {
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

// Regression coverage for StemLeaf at scale beyond the small demo fixtures (n=19-20 in
// data/topics/study.ts and math.ts). A stem-and-leaf plot's illegible-overlap risk is a dense
// stem picking up many leaves on one text line, and a wide value range producing many stem
// rows — this asserts both scale without truncating or colliding data, single-sided and
// back-to-back.
describe('StemLeaf', () => {
  function scores(n: number, seed = 1): number[] {
    // Deterministic pseudo-random spread across 0-199 so stems bunch unevenly, like real data.
    const out: number[] = [];
    let x = seed;
    for (let i = 0; i < n; i++) {
      x = (x * 9301 + 49297) % 233280;
      out.push(Math.floor((x / 233280) * 200));
    }
    return out;
  }

  /** The grid div directly under the scroll frame — everything else (header + data rows) lives
   *  in here, in document order, so slicing off the fixed-size header gives just data cells. */
  function gridCells(container: HTMLElement): HTMLElement[] {
    const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    return Array.from(grid.children) as HTMLElement[];
  }

  it('rolls up every value into its stem row with no leaf dropped, single-sided at scale', () => {
    const values = scores(120, 7);
    const { container } = render(<StemLeaf title="Scores" values={values} leafUnit={1} />);
    // Single-sided grid: 2 header cells ("stem", "leaves"), then [stem, leaves] per data row.
    const cells = gridCells(container).slice(2);
    const leafCells = cells.filter((_, i) => i % 2 === 1);
    // Fold every row's leaf text back into individual digit tokens and count them — the total
    // must equal the input count, nothing silently truncated as n grows past the small fixtures.
    const totalLeaves = leafCells.reduce((sum, el) => {
      const tokens = el.textContent!.trim().split(/\s+/).filter(Boolean);
      return sum + tokens.length;
    }, 0);
    expect(totalLeaves).toBe(values.length);
  });

  it('keeps a dense stem on one nowrap line inside a horizontally-scrollable frame, never clipped', () => {
    // Pile 40 values onto the same stem (tens digit 5, i.e. 50-59) — the worst case for
    // illegible overlap if leaves were ever laid out as separate grid cells instead of one
    // joined, scrollable text run.
    const denseStem = Array.from({ length: 40 }, (_, i) => 50 + (i % 10));
    const { container } = render(<StemLeaf title="Dense" values={denseStem} leafUnit={1} />);
    const scrollFrame = container.querySelector('[style*="overflow"]') as HTMLElement | null;
    expect(scrollFrame).not.toBeNull();
    expect(scrollFrame!.style.overflowX).toBe('auto');
    // Header (2 cells) + exactly one data row (all 40 values share stem 5) = 4 cells total.
    const cells = gridCells(container);
    expect(cells).toHaveLength(4);
    const leafRun = cells[3];
    expect(leafRun.style.whiteSpace).toBe('nowrap');
    expect(leafRun.textContent!.trim().split(/\s+/).filter(Boolean)).toHaveLength(40);
  });

  it('spans the full min/max stem range across both sides in back-to-back mode, dropping no leaf', () => {
    const left = scores(60, 3);
    const right = scores(60, 11);
    const { container } = render(
      <StemLeaf title="Left" title2="Right" values={left} values2={right} leafUnit={1} />,
    );
    const expectedStems =
      Math.floor(Math.max(...left, ...right) / 10) -
      Math.floor(Math.min(...left, ...right) / 10) +
      1;
    // Back-to-back grid: 3 header cells, then [left, stem, right] per data row.
    const cells = gridCells(container).slice(3);
    expect(cells.length / 3).toBe(expectedStems);
    const leftCells = cells.filter((_, i) => i % 3 === 0);
    const rightCells = cells.filter((_, i) => i % 3 === 2);
    const totalLeft = leftCells.reduce(
      (sum, el) => sum + el.textContent!.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const totalRight = rightCells.reduce(
      (sum, el) => sum + el.textContent!.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    expect(totalLeft).toBe(left.length);
    expect(totalRight).toBe(right.length);
  });
});

// Regression coverage for a real bug: the x-axis rendered one <text> per tick at a fixed
// fontSize with no thinning, so a timeline with more than ~12-15 points overlapped into an
// illegible smear. Also covers the accompanying per-band entrance/hover polish.
describe('Streamgraph', () => {
  function series(n: number): StreamSeries[] {
    return [
      { label: 'Alpha', values: Array.from({ length: n }, (_, i) => 10 + i) },
      { label: 'Beta', values: Array.from({ length: n }, (_, i) => 30 - i * 0.5) },
      { label: 'Gamma', values: Array.from({ length: n }, () => 5) },
    ];
  }

  function ticks(n: number): string[] {
    return Array.from({ length: n }, (_, i) => `Week ${i + 1}`);
  }

  it('renders one band per series and does not throw for a wide range of tick counts', () => {
    for (const n of [1, 2, 6, 24, 48]) {
      const { container, unmount } = render(
        <Streamgraph title="Flow" ticks={ticks(n)} series={series(n)} />,
      );
      expect(container.querySelectorAll('path.c1-ts-ring')).toHaveLength(3);
      unmount();
    }
  });

  it('thins x-axis labels once the tick count passes the legibility budget, keeping the first and last', () => {
    const n = 48;
    const { container } = render(<Streamgraph title="Flow" ticks={ticks(n)} series={series(n)} />);
    const labels = Array.from(container.querySelectorAll('svg text')).filter(
      (el) => !el.closest('.c1-ld-pct'),
    );
    // Never one label per tick once dense — that's the exact overlap the bug produced.
    expect(labels.length).toBeLessThan(n);
    expect(labels.length).toBeLessThanOrEqual(13); // budget (12) + a possible hovered extra
    expect(labels[0]?.textContent).toBe('Week 1');
    expect(labels[labels.length - 1]?.textContent).toBe(`Week ${n}`);
  });

  it('does not thin labels when the tick count is already low', () => {
    const n = 6;
    const { container } = render(<Streamgraph title="Flow" ticks={ticks(n)} series={series(n)} />);
    const labels = container.querySelectorAll('svg text');
    expect(labels).toHaveLength(n);
  });

  it('sizes tick labels responsively instead of a bare fixed fontSize attribute', () => {
    // jsdom's CSSOM can't parse clamp() (a real-browser-only limitation), so this asserts the
    // regression at the level that survives in tests: the old hardcoded fontSize="10" attribute
    // is gone, replaced by a CSS font-size the browser resolves against the card's own width.
    const { container } = render(<Streamgraph title="Flow" ticks={ticks(6)} series={series(6)} />);
    const labels = Array.from(container.querySelectorAll('svg text'));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.getAttribute('fontSize')).toBeNull();
      expect(label.getAttribute('font-size')).toBeNull();
    }
  });

  it('marks the largest-by-total band as salient for narration', () => {
    const { container } = render(
      <Streamgraph
        title="Flow"
        ticks={ticks(4)}
        series={[
          { label: 'Small', values: [1, 1, 1, 1] },
          { label: 'Big', values: [50, 60, 70, 80] },
          { label: 'Mid', values: [5, 5, 5, 5] },
        ]}
      />,
    );
    const marked = container.querySelectorAll('path[data-mark="circle"]');
    expect(marked).toHaveLength(1);
    // The salient band is the 2nd rendered path (index 1, "Big").
    const paths = Array.from(container.querySelectorAll('path.c1-ts-ring'));
    expect(paths.indexOf(marked[0] as SVGPathElement)).toBe(1);
  });

  it('lifts the hovered band on mousemove without disturbing the tick crosshair', () => {
    const { container } = render(<Streamgraph title="Flow" ticks={ticks(4)} series={series(4)} />);
    const zones = container.querySelectorAll('svg rect');
    expect(zones.length).toBeGreaterThan(0);
    // Hovering a hit-zone always drives the tick crosshair regardless of band hit-testing.
    fireEvent.mouseEnter(zones[1]);
    expect(container.querySelector('svg line')).not.toBeNull();
  });

  it('still renders bands and labels when every series value is zero (no NaN paths)', () => {
    const flat: StreamSeries[] = [
      { label: 'A', values: [0, 0, 0] },
      { label: 'B', values: [0, 0, 0] },
    ];
    const { container } = render(<Streamgraph title="Flow" ticks={ticks(3)} series={flat} />);
    const paths = container.querySelectorAll('path.c1-ts-ring');
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      expect(p.getAttribute('d')).not.toContain('NaN');
    }
  });
});

// Regression coverage for the same rollup bug Treemap had: a container node authored with
// `value: 0` whose real magnitude lives entirely in its children used to collapse to a
// zero-width wedge instead of sizing itself off effectiveValue(child).
describe('Sunburst', () => {
  const root: SunburstNode = {
    label: 'Atlas',
    value: 0,
    children: [
      {
        label: 'core',
        value: 0,
        children: [
          { label: 'typed-core', value: 48 },
          { label: 'migration', value: 22 },
        ],
      },
      {
        label: 'search',
        value: 0,
        children: [
          { label: 'index', value: 39 },
          { label: 'relevance', value: 17 },
        ],
      },
      { label: 'shared', value: 28 },
    ],
  };

  it('sizes container nodes by their rolled-up children, not their own literal value', () => {
    const { container } = render(<Sunburst title="Where the mass sits" root={root} unit=" kLOC" />);
    // A collapsed (zero-value) wedge draws a degenerate path with no angular sweep, which is
    // awkward to assert on directly — the legend's % readout is computed from the same rollup
    // and is the easiest place to assert the fix exactly.
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map(
      (el) => el.textContent,
    );
    // core: 70, search: 56, shared: 28 → total 154 → 45%, 36%, 18%
    expect(legendPct).toEqual(['45%', '36%', '18%']);
  });

  it('drills into a zero-value container and still renders its children with real spans', () => {
    const { container, getAllByRole } = render(
      <Sunburst title="Where the mass sits" root={root} unit=" kLOC" />,
    );
    const rows = getAllByRole('button', { name: /core/ });
    fireEvent.click(rows[0]);

    const legendLabels = Array.from(container.querySelectorAll('.c1-legend-label')).map(
      (el) => el.textContent,
    );
    expect(legendLabels).toEqual(['typed-core', 'migration']);
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map(
      (el) => el.textContent,
    );
    // typed-core: 48, migration: 22 → total 70 → 69%, 31%
    expect(legendPct).toEqual(['69%', '31%']);
  });

  it('hover summary and center total agree with the rolled-up values, not raw container values', () => {
    const { container, getByText } = render(
      <Sunburst title="Where the mass sits" root={root} unit=" kLOC" />,
    );
    // Center total: 70 + 56 + 28 = 154, matching effectiveValue(root) not root.value (0).
    expect(getByText('kLOC154')).toBeInTheDocument();

    const coreRow = container.querySelector('.c1-legend-row');
    expect(coreRow).toBeTruthy();
    fireEvent.mouseEnter(coreRow!);
    const summary = container.querySelector('.insight-summary');
    // core's hovered readout should show its rolled-up 70, not its literal value of 0.
    expect(summary?.textContent).toContain('70');
    expect(summary?.textContent).toContain('45% of Atlas');
  });

  it('renders a larger hierarchy (10 leaf categories) without any wedge going illegibly thin', () => {
    const many: SunburstNode = {
      label: 'Portfolio',
      value: 0,
      children: Array.from({ length: 10 }, (_, i) => ({
        label: `Segment ${i + 1}`,
        value: (i + 1) * 3,
      })),
    };
    const { container } = render(<Sunburst title="Portfolio mix" root={many} />);
    expect(container.querySelectorAll('.c1-legend-row')).toHaveLength(10);
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map((el) =>
      Number((el.textContent || '0%').replace('%', '')),
    );
    // Every segment carries real weight, so every percentage should be > 0 — none silently
    // dropped to a zero-width wedge.
    legendPct.forEach((p) => expect(p).toBeGreaterThan(0));
    expect(legendPct.reduce((s, p) => s + p, 0)).toBeGreaterThan(95); // rounds to ~100
  });
});

// Regression coverage for Venn's fixed 2/3-circle geometry: the layout is only ever built for
// n = clamp(sets.length, 2, 3), so a caller handing it more sets (or an out-of-range overlap
// index) must not blow past that clamp and produce extra/misplaced circles or a crash.
describe('Venn', () => {
  function sets(n: number): VennSet[] {
    const labels = ['Design', 'Engineering', 'Product', 'Sales', 'Support', 'Legal'];
    return Array.from({ length: n }, (_, i) => ({
      label: labels[i] ?? `Set ${i + 1}`,
      value: 10 * (i + 1),
    }));
  }

  it.each([2, 3, 4, 6])('renders exactly the clamped 2-or-3 circles for %i input sets', (n) => {
    const { container } = render(<Venn title="Overlap" sets={sets(n)} />);
    const circles = container.querySelectorAll('.c1-venn-svg circle');
    const expected = Math.min(3, Math.max(2, n));
    expect(circles).toHaveLength(expected);
    // Legend rows track the same clamp — no orphaned legend entries for sets that have no circle.
    expect(container.querySelectorAll('.c1-venn-leg')).toHaveLength(expected);
  });

  it('ignores overlaps that reference set indices beyond the rendered circle count', () => {
    const overlaps: VennOverlap[] = [
      { sets: [0, 1], value: 5 },
      // References set index 4, which doesn't exist once 6 sets clamp down to 3 circles.
      { sets: [1, 4], value: 99 },
    ];
    const { container } = render(<Venn title="Overlap" sets={sets(6)} overlaps={overlaps} />);
    const values = Array.from(container.querySelectorAll('.c1-venn-val')).map((n) => n.textContent);
    expect(values).not.toContain('99');
    expect(values).toContain('5');
  });

  it('keeps every label/value text node inside the declared viewBox bounds', () => {
    const overlaps: VennOverlap[] = [
      { sets: [0, 1], value: 12 },
      { sets: [1, 2], value: 7 },
      { sets: [0, 1, 2], value: 3 },
    ];
    const { container } = render(<Venn title="Overlap" sets={sets(3)} overlaps={overlaps} />);
    const svg = container.querySelector('.c1-venn-svg') as SVGSVGElement;
    const [, , vbW, vbH] = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
    const texts = Array.from(container.querySelectorAll('.c1-venn-val'));
    // Three exclusive counts + three overlap counts — none dropped, none duplicated.
    expect(texts).toHaveLength(6);
    for (const t of texts) {
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(vbW);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(vbH);
    }
  });
});

// Regression coverage for a bug found from a live screenshot: ViolinPlot's bottom group labels
// sat at a fixed font-size regardless of how many groups were plotted, so past ~4-5 groups the
// (unchanged) label width outpaced its narrowing slot and neighboring labels overlapped.
describe('ViolinPlot', () => {
  function groups(n: number): ViolinGroup[] {
    const labels = [
      'Morning',
      'Afternoon',
      'Evening',
      'Overnight',
      'Pre-workout',
      'Post-workout',
      'Fasting',
      'Post-meal',
      'Weekend',
      'Weekday',
    ];
    return Array.from({ length: n }, (_, i) => ({
      label: labels[i] ?? `Group ${i + 1}`,
      // Widening, shifting distributions per index so peak density strictly decreases with i —
      // the tightest, most-concentrated group (index 0) is deterministically the salient one.
      values: Array.from({ length: 40 }, (_, k) => 100 + i * 5 + (k % (3 + i)) * 0.6),
    }));
  }

  it.each([2, 4, 6, 10])('renders %i group(s) with no illegible label overlap', (n) => {
    const { container } = render(<ViolinPlot title="Distribution" groups={groups(n)} />);
    // One label per group, found via its sibling violin path (the y-axis tick labels sit in
    // their own <g> with no path, so they're excluded).
    const groupLabels = Array.from(container.querySelectorAll('g')).filter((g) =>
      g.querySelector('.c1-violin-path'),
    );
    expect(groupLabels).toHaveLength(n);

    // Font shrinks as groups pack in — this is the actual fix: it used to be a hardcoded "10"
    // no matter how many groups were plotted, which is what let labels collide past ~5 groups.
    const sizes = groupLabels.map((g) =>
      Number(g.querySelector('text')?.getAttribute('font-size')),
    );
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(8);
      expect(size).toBeLessThanOrEqual(10);
    }
    if (n > 5) {
      expect(sizes.every((s) => s === 8)).toBe(true);
    } else if (n > 4) {
      expect(sizes.every((s) => s === 9)).toBe(true);
    } else {
      expect(sizes.every((s) => s === 10)).toBe(true);
    }
  });

  it('marks the group with the tallest density peak, not always the first group', () => {
    // groups(5) narrows (and therefore peaks higher) as the index grows, so the last group
    // (index 4) has the tallest curve — the naive "always index 0" bug would miss this.
    const narrowing: ViolinGroup[] = Array.from({ length: 5 }, (_, i) => ({
      label: `G${i}`,
      // Fewer distinct values (tighter spread) at higher indices ⇒ taller kernel density peak.
      values: Array.from({ length: 40 }, (_, k) => 100 + (k % (10 - i)) * 0.5),
    }));
    const { container } = render(<ViolinPlot title="Spread" groups={narrowing} />);
    const marked = container.querySelectorAll(".c1-violin-path[data-mark='circle']");
    expect(marked).toHaveLength(1);
    const paths = Array.from(container.querySelectorAll('.c1-violin-path'));
    expect(paths.indexOf(marked[0] as Element)).toBe(4);
  });

  it('gives every violin path a staggered entrance index for the shared fade-rise animation', () => {
    const { container } = render(<ViolinPlot title="Spread" groups={groups(4)} />);
    const paths = Array.from(container.querySelectorAll('.c1-violin-path'));
    expect(paths).toHaveLength(4);
    paths.forEach((el, i) => {
      expect((el as HTMLElement).style.getPropertyValue('--i')).toBe(String(i));
    });
  });

  it('renders nothing for an empty group list instead of throwing', () => {
    const { container } = render(<ViolinPlot title="Empty" groups={[]} />);
    expect(container.querySelector('.c1-violin-path')).toBeNull();
  });
});

// Regression coverage for the waterfall cascade entrance: each bar must carry the
// .c1-waterfall-bar class (the shared stagger/glow animation in charts1/styles.css
// keys off it) and its own --bar-idx so the cascade reads left-to-right instead of
// every bar animating in unison. Also guards bar-width/slot sizing at a step count
// well past the demo fixture, so bars can't crowd into illegible overlap.
describe('Waterfall', () => {
  function steps(n: number): WaterfallStep[] {
    return [
      { label: 'Start', value: 100, total: true },
      ...Array.from({ length: n - 2 }, (_, i) => ({
        label: `Step ${i + 1}`,
        value: i % 2 === 0 ? 12 : -7,
      })),
      {
        label: 'End',
        value: 100 + Math.ceil((n - 2) / 2) * 12 - Math.floor((n - 2) / 2) * 7,
        total: true,
      },
    ];
  }

  it('stamps every bar with the cascade-entrance class and a unique --bar-idx stagger', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(6)} />);
    const bars = Array.from(container.querySelectorAll<SVGRectElement>('.c1-waterfall-bar'));
    expect(bars).toHaveLength(6);
    bars.forEach((bar, i) => {
      expect(bar.style.getPropertyValue('--bar-idx')).toBe(String(i));
    });
  });

  it('marks exactly one bar as salient for the glow beat', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(8)} />);
    const marked = container.querySelectorAll('.c1-waterfall-bar[data-mark="circle"]');
    expect(marked).toHaveLength(1);
  });

  it('keeps bars legible (non-degenerate width, no overlap) well past the demo fixture size', () => {
    // The demo fixture is a handful of steps; a real answer can run much longer. Bar width
    // and slot spacing must still keep every bar readable and non-overlapping.
    const n = 24;
    const { container } = render(<Waterfall title="Long bridge" steps={steps(n)} />);
    const bars = Array.from(container.querySelectorAll<SVGRectElement>('.c1-waterfall-bar'));
    expect(bars).toHaveLength(n);

    const spans = bars
      .map((bar) => {
        const x = Number(bar.getAttribute('x'));
        const width = Number(bar.getAttribute('width'));
        return { x, width };
      })
      .sort((a, b) => a.x - b.x);

    spans.forEach((s) => {
      // Every bar keeps a legible minimum width — it never collapses to a hairline.
      expect(s.width).toBeGreaterThanOrEqual(2);
    });
    for (let i = 1; i < spans.length; i++) {
      // Consecutive bars (sorted left-to-right) must not overlap horizontally.
      expect(spans[i].x).toBeGreaterThanOrEqual(spans[i - 1].x + spans[i - 1].width);
    }
  });

  it('dims non-hovered bars so the hovered one reads as the spotlighted datum', () => {
    const { container } = render(<Waterfall title="Bridge" steps={steps(5)} />);
    const groups = Array.from(container.querySelectorAll<SVGGElement>('svg > g'));
    expect(groups).toHaveLength(5);

    fireEvent.mouseEnter(groups[1]);
    groups.forEach((g, i) => {
      expect(g.style.opacity).toBe(i === 1 ? '1' : '0.45');
    });

    fireEvent.mouseLeave(groups[1]);
    groups.forEach((g) => {
      expect(g.style.opacity).toBe('1');
    });
  });
});
