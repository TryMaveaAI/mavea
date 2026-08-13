import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import { AreaPlot } from '../src/canvas/blocks/charts2/AreaPlot';
import { AreaRange } from '../src/canvas/blocks/charts2/AreaRange';
import { BigO } from '../src/canvas/blocks/charts2/BigO';
import { Bubble } from '../src/canvas/blocks/charts2/Bubble';
import { BumpChart } from '../src/canvas/blocks/charts2/BumpChart';
import { Candlestick } from '../src/canvas/blocks/charts2/Candlestick';
import { ControlChart } from '../src/canvas/blocks/charts2/ControlChart';
import { DotPlot } from '../src/canvas/blocks/charts2/DotPlot';
import { DualAxis } from '../src/canvas/blocks/charts2/DualAxis';
import { EcgStrip } from '../src/canvas/blocks/charts2/EcgStrip';
import { ErrorBars } from '../src/canvas/blocks/charts2/ErrorBars';
import { Gantt } from '../src/canvas/blocks/charts2/Gantt';
import { IndifferenceCurve } from '../src/canvas/blocks/charts2/IndifferenceCurve';
import { PayoffDiagram } from '../src/canvas/blocks/charts2/PayoffDiagram';
import { Plot } from '../src/canvas/blocks/charts2/Plot';
import { QQPlot } from '../src/canvas/blocks/charts2/QQPlot';
import { SeasonBand } from '../src/canvas/blocks/charts2/SeasonBand';
import { Slopegraph } from '../src/canvas/blocks/charts2/Slopegraph';
import { TernaryPlot } from '../src/canvas/blocks/charts2/TernaryPlot';
import type {
  AreaCurve,
  BubbleCategory,
  BubblePoint,
  BumpSeries,
  Candle,
  ControlChartPoint,
  ErrorGroup,
  GanttTask,
  IdfCurve,
  OptionLeg,
  PlotMarker,
  RangePoint,
  SeasonRow,
  SlopeRow,
  TernaryAxes,
  TernaryPoint,
  TernaryZone,
} from '../src/canvas/blocks/charts2/types';
import { estimateTextWidth } from '../src/canvas/lib/fitText';

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

// Regression coverage for a real bug: the area read-out badge (.apl-area) is plain SVG <text>
// centred in the shaded region with no width constraint or wrapping, sized off the demo's short
// "area ≈ N" text. A long caller-supplied areaLabel — or a narrow integration interval, which
// shrinks the region's own pixel width — let the badge render wider than the shaded fill and
// bleed out past it. Every rendered badge must fit inside the region it's centred in.
describe('AreaPlot', () => {
  function curve(): AreaCurve {
    return {
      label: 'f(x)',
      points: [
        { x: 0, y: 1 },
        { x: 2, y: 4 },
        { x: 4, y: 2 },
        { x: 6, y: 5 },
        { x: 8, y: 1 },
        { x: 10, y: 3 },
      ],
    };
  }

  it('truncates a long areaLabel instead of letting the badge overflow the shaded region', () => {
    const longLabel = 'A Much Longer Symbolic Area Label Than The Demo Ever Used ∫ f(x) dx';
    const { container } = render(
      <AreaPlot
        title="Integral"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 0, x1: 10 }}
        areaLabel={longLabel}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();

    // The region here spans the full plot width, so this is a "long label" case: the visible
    // glyphs must be short enough to plausibly fit within the region's own pixel width at the
    // badge's font-size, not the raw ~68-character label.
    expect(visibleText(badge!).length).toBeLessThan(longLabel.length);
    expect(visibleText(badge!).endsWith('…')).toBe(true);
    // The untruncated string is still present, via a native <title> tooltip.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(longLabel);
  });

  it('truncates even a short areaLabel when the integration interval narrows the region', () => {
    // Same short label the demo would use, but a narrow x0..x1 shrinks the shaded region to a
    // sliver — the label must still fit the region's actual pixel width, not just be "short".
    const label = 'area of narrow slice';
    const { container } = render(
      <AreaPlot
        title="Narrow slice"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 4.9, x1: 5.1 }}
        areaLabel={label}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();
    expect(visibleText(badge!).length).toBeLessThan(label.length);
    expect(visibleText(badge!).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(label);
  });

  it('leaves a short areaLabel untouched when the region is wide enough', () => {
    const label = 'area ≈ 24';
    const { container } = render(
      <AreaPlot
        title="Integral"
        curves={[curve()]}
        shade={{ from: 'axis', to: 0, x0: 0, x1: 10 }}
        areaLabel={label}
      />,
    );
    const badge = container.querySelector('text.apl-area');
    expect(badge).toBeTruthy();
    expect(visibleText(badge!)).toBe(label);
    expect(container.querySelector('title')).toBeNull();
  });
});

// Regression coverage for a real bug: the hover tooltip (.c2-ar-tip) had no width constraint and
// used white-space: nowrap, so a longer label (or points denser than the 7-day / 3-4 char demo
// fixture) rendered wider than the gap between neighboring points, colliding with them instead of
// truncating. The fix caps the tooltip's width and ellipsis-truncates the label.
describe('AreaRange', () => {
  function points(n: number, labelLen = 3): RangePoint[] {
    return Array.from({ length: n }, (_, i) => ({
      label: 'Day '.repeat(1) + 'X'.repeat(labelLen) + i,
      value: 40 + i,
      lo: 30 + i,
      hi: 50 + i,
    }));
  }

  it('positions the tooltip per-point without spilling past the plot at high density', () => {
    const n = 24; // well beyond the 7-day demo fixture
    const { container } = render(<AreaRange title="Range" points={points(n)} />);
    const cols = Array.from(container.querySelectorAll('svg > g'));
    expect(cols).toHaveLength(n);

    // Hover every point; the tooltip's `left` percentage must land inside [0, 100] so it never
    // renders centered outside the plot's own coordinate space.
    for (const col of cols) {
      fireEvent.mouseEnter(col);
      const tip = container.querySelector<HTMLElement>('.c2-ar-tip');
      expect(tip).toBeTruthy();
      const left = parseFloat(tip!.style.left);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
    }
  });

  it('keeps the full label in the DOM (as text) even with a name far longer than the demo fixture', () => {
    const longLabel = 'A Much Longer Label Than The Demo Ever Used';
    const pts: RangePoint[] = [
      { label: longLabel, value: 10, lo: 5, hi: 15 },
      { label: 'Short', value: 12, lo: 6, hi: 18 },
      { label: 'Mid', value: 11, lo: 7, hi: 16 },
    ];
    const { container } = render(<AreaRange title="Range" points={pts} />);
    const firstCol = container.querySelectorAll('svg > g')[0];
    fireEvent.mouseEnter(firstCol);
    const tipLabel = container.querySelector('.c2-ar-tip b');
    expect(tipLabel?.textContent).toBe(longLabel);
  });

  it('constrains .c2-ar-tip to a bounded width and truncates its label instead of nowrap-overflowing', () => {
    // No layout engine in jsdom, so assert the CSS contract directly: the tooltip must cap its
    // width and the label must be allowed to ellipsis rather than force the box wider than its
    // neighbors' spacing.
    const css = readFileSync(join(__dirname, '..', 'src/canvas/blocks/charts2/styles.css'), 'utf8');
    const tipRule = css.match(/\.c2-ar-tip\s*\{[^}]*\}/)?.[0] ?? '';
    expect(tipRule).toMatch(/max-width:/);

    const labelRule = css.match(/\.c2-ar-tip\s+b\s*\{[^}]*\}/)?.[0] ?? '';
    expect(labelRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(labelRule).toMatch(/overflow:\s*hidden/);
    expect(labelRule).toMatch(/white-space:\s*nowrap/);
  });
});

// Regression coverage for a real bug: each curve's inline label rode a start-anchored <text>
// nudged a fixed +5px past its anchor point, which sits near the plot's right edge by design
// (the anchor is the curve's last in-view sample). Start-anchored text grows RIGHTWARD from
// that x, so the longer class labels ("O(n log n)", the widest of the six canonical strings)
// ran past the fixed 340×230 viewBox instead of staying inside the PAD_R gutter reserved for
// them. All six classes shown together is exactly the case that reproduces it — the demo
// fixture typically shows fewer.
describe('BigO', () => {
  const W = 340; // must track BigO.tsx's internal W — fixed-viewBox, not measured live.
  const H = 230;

  it('parks every curve label inside the fixed viewBox, even the longest class label', () => {
    const { container } = render(
      <BigO
        title="Growth rates"
        classes={['o-1', 'o-logn', 'o-n', 'o-nlogn', 'o-n2', 'o-2n']}
        maxN={16}
      />,
    );
    const svg = container.querySelector('svg.bgo-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);

    const labels = Array.from(container.querySelectorAll('text.bgo-curve-lbl'));
    // All six canonical classes, including "O(n log n)" — the widest label string.
    expect(labels).toHaveLength(6);
    expect(labels.map((l) => l.textContent)).toContain('O(n log n)');

    // End-anchored at a fixed right-edge margin: text grows LEFTWARD from x, so as long as x
    // itself never exceeds the viewBox width, no label can bleed past the right edge —
    // regardless of string length. This is what the old start-anchored + fixed nudge broke.
    for (const label of labels) {
      expect(label.getAttribute('text-anchor')).toBe('end');
      const x = Number(label.getAttribute('x'));
      expect(x).toBeLessThanOrEqual(W);
      expect(x).toBeGreaterThan(0);
    }
  });

  it('keeps a single short curve label anchored the same way, unbroken by the fix', () => {
    const { container } = render(<BigO title="Growth rates" classes={['o-1']} maxN={8} />);
    const labels = Array.from(container.querySelectorAll('text.bgo-curve-lbl'));
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toBe('O(1)');
    expect(labels[0].getAttribute('text-anchor')).toBe('end');
    expect(Number(labels[0].getAttribute('x'))).toBeLessThanOrEqual(W);
  });
});

// Regression coverage for a real bug: the hover tooltip (.c2-bub-tip) is `position: absolute`
// with `white-space: nowrap` and no width cap, sized only for the short demo-fixture labels.
// A real-world point label far longer than the fixture pushes the tooltip's rendered width out
// past any reasonable card boundary instead of truncating — illegible overflow, not a small
// alignment nit.
describe('Bubble', () => {
  const categories: BubbleCategory[] = [{ name: 'Segment', color: 'var(--presence)' }];

  function longLabelPoints(): BubblePoint[] {
    return [
      {
        label:
          'Enterprise Cloud Infrastructure Modernization & Multi-Region Disaster Recovery Program',
        x: 10,
        y: 20,
        size: 8,
        cat: 'Segment',
      },
      { label: 'Small deal', x: 30, y: 40, size: 4, cat: 'Segment' },
    ];
  }

  it('caps the hover tooltip width and ellipsizes a long point label instead of overflowing', () => {
    const { container } = render(
      <Bubble title="Deals" categories={categories} points={longLabelPoints()} />,
    );
    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles).toHaveLength(2);

    // Hover the bubble carrying the very long label.
    fireEvent.mouseEnter(circles[0]);

    const tip = container.querySelector<HTMLElement>('.c2-bub-tip');
    expect(tip).toBeTruthy();
    // Inline maxWidth caps the tooltip box itself so it can't grow to fit an arbitrarily long
    // label — this is the exact dimension that was previously unconstrained.
    expect(tip!.style.maxWidth).toBe('200px');

    const labelEl = tip!.querySelector('b')!;
    expect(labelEl.textContent).toBe(longLabelPoints()[0].label);
    // The label itself must be set up to truncate rather than force the tooltip wider: hidden
    // overflow + ellipsis + a width ceiling relative to its (capped) container.
    expect(labelEl.style.overflow).toBe('hidden');
    expect(labelEl.style.textOverflow).toBe('ellipsis');
    expect(labelEl.style.whiteSpace).toBe('nowrap');
    expect(labelEl.style.maxWidth).toBe('100%');
  });

  it('still shows the short demo-fixture-sized label untruncated', () => {
    const { container } = render(
      <Bubble title="Deals" categories={categories} points={longLabelPoints()} />,
    );
    const circles = Array.from(container.querySelectorAll('circle'));
    fireEvent.mouseEnter(circles[1]);
    const tip = container.querySelector<HTMLElement>('.c2-bub-tip');
    expect(tip!.querySelector('b')!.textContent).toBe('Small deal');
  });
});

// Regression coverage: final-period series-name labels were positioned directly at the rank's
// y-coordinate with no collision avoidance, so two series tied at the same final rank printed
// their labels on top of each other.
describe('BumpChart', () => {
  it('spreads name labels apart when two series tie at the final rank', () => {
    const series: BumpSeries[] = [
      { label: 'Alpha', ranks: [1, 2, 3] },
      { label: 'Beta', ranks: [2, 1, 3] },
    ];
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2', 'Q3']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(2);
    const ys = labels.map((n) => Number(n.getAttribute('y')));
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(14);
  });

  it('spreads labels for many series clustered near the bottom rank', () => {
    const series: BumpSeries[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Series ${i}`,
      ranks: [i + 1, 8 - i, 8, 8],
    }));
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2', 'Q3', 'Q4']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(8);
    const ys = labels.map((n) => Number(n.getAttribute('y'))).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(13.9);
    }
  });

  it('keeps well-separated ranks at their natural label position', () => {
    const series: BumpSeries[] = [
      { label: 'Top', ranks: [1, 1] },
      { label: 'Bottom', ranks: [4, 4] },
    ];
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(2);
  });
});

// Regression coverage for a real bug: the axis row (.c2-cs-axis) is a `justify-content:
// space-between` flex row holding the first/last candle's period label with no width cap —
// sized only for the short demo-fixture strings ("Jan", "Dec"). A real-world date/period label
// far longer than the fixture wraps or pushes the opposite label past the card edge instead of
// truncating.
describe('Candlestick', () => {
  function candles(firstLabel: string, lastLabel: string): Candle[] {
    return [
      { label: firstLabel, o: 10, h: 12, l: 9, c: 11 },
      { label: 'mid', o: 11, h: 13, l: 10, c: 12 },
      { label: lastLabel, o: 12, h: 14, l: 11, c: 13 },
    ];
  }

  it('caps and ellipsizes long axis labels instead of overflowing the row', () => {
    const longFirst = 'Week ending March 3rd, 2024 (pre-market session)';
    const longLast = 'Week ending September 29th, 2025 (after-hours session)';
    const { container } = render(
      <Candlestick title="Price" candles={candles(longFirst, longLast)} />,
    );

    const labels = Array.from(container.querySelectorAll<HTMLElement>('.c2-cs-axis span'));
    expect(labels).toHaveLength(2);
    // Full text is preserved in the DOM (it's a CSS-only truncation, not a string clip)...
    expect(labels[0].textContent).toBe(longFirst);
    expect(labels[1].textContent).toBe(longLast);
    // ...but each label is set up to truncate rather than wrap or grow past its half of the
    // space-between row: hidden overflow + ellipsis + a width ceiling relative to the row.
    for (const label of labels) {
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.textOverflow).toBe('ellipsis');
      expect(label.style.whiteSpace).toBe('nowrap');
      expect(label.style.maxWidth).toBe('48%');
    }
  });

  it('still shows the short demo-fixture-sized labels untouched', () => {
    const { container } = render(<Candlestick title="Price" candles={candles('Jan', 'Dec')} />);
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.c2-cs-axis span'));
    expect(labels.map((l) => l.textContent)).toEqual(['Jan', 'Dec']);
  });
});

// Regression coverage for a real bug: once a run has more than 7 points, ControlChart rotates
// its x-axis tick labels -40° to keep them from colliding. Rotating a label swings its bounding
// box down below the horizontal baseline by sin(40°) × label-width — a label longer than the
// tiny ~6-char demo fixture ("Week 1") descended past the SVG viewBox floor and was clipped by
// the SVG's default overflow:hidden before the card ever rendered it.
describe('ControlChart', () => {
  const H = 240; // must track ControlChart.tsx's viewBox height — fixed-viewBox, not measured live.
  const M_BOTTOM = 60; // must track ControlChart.tsx's M.bottom margin.

  function points(n: number, labelLength: number): ControlChartPoint[] {
    return Array.from({ length: n }, (_, i) => ({
      label: `Batch-${String(i).padStart(2, '0')}`.padEnd(labelLength, 'x'),
      value: 50 + Math.sin(i) * 5,
    }));
  }

  it('rotates x-axis labels once past 7 points, same as the sparse demo fixture', () => {
    const { container } = render(
      <ControlChart title="Process" points={points(3, 6)} ucl={60} lcl={40} centerLine={50} />,
    );
    const ticks = Array.from(container.querySelectorAll('text.c2-cc-xtick'));
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t.getAttribute('transform')).toBeNull();
    }
  });

  it.each([10, 20])('keeps rotated long labels inside the viewBox for %i points', (n) => {
    // Long labels (well beyond the ~6-char demo fixture) are exactly what pushed a rotated
    // label's descent past the old 40px bottom margin.
    const { container } = render(
      <ControlChart title="Process" points={points(n, 14)} ucl={60} lcl={40} centerLine={50} />,
    );
    const svg = container.querySelector('svg.c2-cc-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const [, , , viewBoxH] = viewBox;
    expect(viewBoxH).toBe(H);

    const ticks = Array.from(container.querySelectorAll<SVGTextElement>('text.c2-cc-xtick'));
    expect(ticks.length).toBeGreaterThan(0);

    for (const t of ticks) {
      // Rotated labels anchor 'end' and pivot via `rotate(-40, x, y)` around their own
      // baseline y — the same shape ControlChart.tsx emits.
      expect(t.getAttribute('transform')).toMatch(/rotate\(-40,/);
      const y = Number(t.getAttribute('y'));
      const label = t.textContent ?? '';
      // Approximate glyph width for the 9.5px axis-tick font (~6px/char average for a sans
      // font — the same ratio the component's own margin comment budgets against: "~84px
      // wide, ≈14 chars"), then project the rotated bounding box's descent below the
      // label's rotation anchor.
      const approxWidth = label.length * 6;
      const descent = Math.sin((40 * Math.PI) / 180) * approxWidth;
      const lowestPoint = y + descent;
      // The label's rotated footprint must stay inside the fixed viewBox — this is exactly
      // what the old M.bottom=40 / H=220 layout failed for any label wider than ~53px.
      expect(lowestPoint).toBeLessThanOrEqual(H);
    }
  });

  it('does not let a 14-character label overflow the fixed-height card wrapper', () => {
    // The wrapper clamps to a fixed pixel height (clamp(200px, 50cqi, 280px)) matching the
    // 480:240 viewBox aspect ratio; overflow:hidden on the wrapper is the last line of defense,
    // but the SVG content itself must stay within its own viewBox — this is what regressed.
    const longLabelPoints: ControlChartPoint[] = Array.from({ length: 12 }, (_, i) => ({
      label: `Milestone ${i + 1} Review`, // ~20 chars, far past the ~6-char demo fixture
      value: 50 + i,
    }));
    const { container } = render(
      <ControlChart title="Process" points={longLabelPoints} ucl={70} lcl={30} centerLine={50} />,
    );
    const svg = container.querySelector('svg.c2-cc-svg')!;
    const [, , , viewBoxH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    expect(viewBoxH).toBe(H);

    const ticks = Array.from(container.querySelectorAll<SVGTextElement>('text.c2-cc-xtick'));
    for (const t of ticks) {
      const y = Number(t.getAttribute('y'));
      // Every rotated tick's un-rotated anchor point must sit above the viewBox floor with
      // room for its own margin band — regression guard for the 40px-bottom-margin bug where
      // even the anchor's clearance was too tight for long labels.
      expect(y).toBeLessThan(H);
      expect(H - y).toBeGreaterThanOrEqual(M_BOTTOM - 6);
    }
  });
});

// Regression coverage for a real bug: the hover "×N" count badge above a stack of duplicate
// values was positioned with a fixed top margin that never accounted for the badge's own
// height. The badge for the tallest stack always rendered at a fixed negative y (independent
// of stack height), floating above the SVG's y=0 boundary — with `overflow: visible` on the
// wrapping <svg>, that means visible clipping/overlap above the card on any data with 2+
// duplicate values, not just tall ones. The demo fixture used no duplicates at all, so this
// never surfaced there.
describe('DotPlot', () => {
  /** The hovered stack's count badge, if rendered. */
  function badgeRect(container: HTMLElement) {
    return container.querySelector<SVGRectElement>('.ch2-dp-badge-bg');
  }

  it('keeps the hover count badge within the chart bounds for a tall duplicate stack', () => {
    // Far more duplicates at one value than the demo fixture (which has none) — this is the
    // shape that pushed the badge's fixed offset past the top of the viewBox.
    const values = [7, 7, 7, 7, 7, 7, 7, 7, 3, 12];
    const { container } = render(<DotPlot title="Scores" values={values} />);

    // Scope to the chart's own <svg> — the card-eyebrow icon is also an inline <svg>.
    const svg = container.querySelector('svg.ch2-dp-svg');
    expect(svg).toBeTruthy();
    const viewBox = svg!.getAttribute('viewBox')!.split(' ').map(Number);
    const svgH = viewBox[3];

    // Hover the <g> that owns the tallest stack (8 dots at the same cx) to reveal its badge.
    const groups = Array.from(svg!.querySelectorAll('g')).filter(
      (g) => g.querySelectorAll('.ch2-dp-dot').length === 8,
    );
    expect(groups).toHaveLength(1);
    fireEvent.mouseEnter(groups[0]);

    const badge = badgeRect(container);
    expect(badge).toBeTruthy();
    const badgeY = Number(badge!.getAttribute('y'));
    const badgeH = Number(badge!.getAttribute('height'));

    // The badge's top edge must not float above the chart's own top boundary (y=0 in its
    // local viewBox coordinates) — that's the illegible upward-overflow failure mode.
    expect(badgeY).toBeGreaterThanOrEqual(0);
    // And it must stay inside the chart's declared height, not just above zero.
    expect(badgeY + badgeH).toBeLessThanOrEqual(svgH);
  });

  it.each([2, 5, 12, 30])(
    'never floats the count badge above y=0 as the tallest stack grows to %i dots',
    (count) => {
      const values = Array.from({ length: count }, () => 4).concat([1, 9]);
      const { container } = render(<DotPlot title="Scores" values={values} />);

      const svg = container.querySelector('svg.ch2-dp-svg')!;
      const groups = Array.from(svg.querySelectorAll('g')).filter(
        (g) => g.querySelectorAll('.ch2-dp-dot').length === count,
      );
      expect(groups).toHaveLength(1);
      fireEvent.mouseEnter(groups[0]);

      const badge = badgeRect(container);
      expect(badge).toBeTruthy();
      expect(Number(badge!.getAttribute('y'))).toBeGreaterThanOrEqual(0);
    },
  );

  it('renders no badge for a stack with a single dot (nothing to overflow)', () => {
    const { container } = render(<DotPlot title="Scores" values={[1, 2, 3]} />);
    const svg = container.querySelector('svg.ch2-dp-svg')!;
    const groups = Array.from(svg.querySelectorAll('g')).filter(
      (g) => g.querySelectorAll('.ch2-dp-dot').length === 1,
    );
    expect(groups.length).toBeGreaterThan(0);
    fireEvent.mouseEnter(groups[0]);
    expect(badgeRect(container)).toBeNull();
  });
});

// Regression coverage for a real bug: category labels sat at a fixed horizontal offset with no
// wrap/clip, sized against the demo fixture's 4 short categories ("Wk1"..."Wk4"). As category
// count grew past that fixture (or a category name ran longer than "Wk1"), the shrinking band
// width packed each label's fixed-width text into its neighbor — illegible overlap instead of a
// readable axis.
describe('DualAxis', () => {
  const W = 320; // must track DualAxis.tsx's internal W — fixed-viewBox, not measured live.
  const H = 210;

  function series(n: number, labelFor: (i: number) => string) {
    const categories = Array.from({ length: n }, (_, i) => labelFor(i));
    const bar = { name: 'Hours', data: Array.from({ length: n }, (_, i) => 4 + i) };
    const line = { name: 'Score', data: Array.from({ length: n }, (_, i) => 50 + i * 2) };
    return { categories, bar, line };
  }

  /** Category-label <text> nodes — the ones anchored at each category's x-band, as opposed to
   * the left/right axis value ticks which sit pinned to the fixed left/right margin x. */
  function categoryLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll('svg text.cx-tick')).filter((t) => {
      const x = Number(t.getAttribute('x'));
      return x > 32 && x < W - 34; // strictly inside the plot area, unlike the pinned axis ticks
    });
  }

  it('keeps short-label spacing unchanged at the demo fixture count', () => {
    const { categories, bar, line } = series(4, (i) => `Wk${i + 1}`);
    const { container } = render(
      <DualAxis title="Hours vs. score" categories={categories} bar={bar} line={line} />,
    );
    const labels = categoryLabels(container);
    // Below the rotation threshold, labels stay horizontal and centred — unchanged look for
    // the common case the demo fixture represents.
    for (const l of labels) {
      expect(l.getAttribute('transform')).toBeNull();
      expect(l.getAttribute('text-anchor')).toBe('middle');
      expect(visibleText(l)).not.toMatch(/…$/);
    }
  });

  it('rotates category labels once the count grows well past the demo fixture', () => {
    const { categories, bar, line } = series(12, (i) => `Category ${i + 1}`);
    const { container } = render(
      <DualAxis title="Hours vs. score" categories={categories} bar={bar} line={line} />,
    );
    const labels = categoryLabels(container);
    expect(labels.length).toBeGreaterThanOrEqual(12);
    for (const l of labels) {
      // Rotated onto a diagonal so a narrow band never has to fit horizontal text into a
      // space narrower than the text itself.
      expect(l.getAttribute('transform')).toMatch(/^rotate\(-40,/);
      expect(l.getAttribute('text-anchor')).toBe('end');
    }
  });

  it('truncates an unusually long category name instead of letting it overlap its neighbors', () => {
    const { categories, bar, line } = series(10, (i) =>
      i === 3 ? 'A very long category name that would otherwise collide' : `Cat ${i + 1}`,
    );
    const { container } = render(
      <DualAxis title="Hours vs. score" categories={categories} bar={bar} line={line} />,
    );
    const labels = categoryLabels(container);
    const long = labels[3];
    expect(long).toBeTruthy();
    // Visible glyphs are clipped to a short, fixed budget regardless of the source string's
    // length, with the full text preserved as a native tooltip so nothing is silently lost.
    expect(visibleText(long).length).toBeLessThanOrEqual(10);
    expect(visibleText(long).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('A very long category name that would otherwise collide');
  });

  it('never lets a category label render outside the fixed viewBox at a high item count', () => {
    const { categories, bar, line } = series(16, (i) => `Category ${i + 1}`);
    const { container } = render(
      <DualAxis title="Hours vs. score" categories={categories} bar={bar} line={line} />,
    );
    const svg = container.querySelector('svg.c2-da-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);
    for (const el of categoryLabels(container)) {
      const x = Number(el.getAttribute('x'));
      const y = Number(el.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(H);
    }
  });

  it('renders each category label once regardless of item count, with no duplicate x-positions', () => {
    const { categories, bar, line } = series(9, (i) => `C${i}`);
    const { container } = render(
      <DualAxis title="Hours vs. score" categories={categories} bar={bar} line={line} />,
    );
    const xs = categoryLabels(container).map((t) => t.getAttribute('x'));
    expect(new Set(xs).size).toBe(xs.length);
  });
});

// Regression coverage: interval bracket labels only staggered across 2 vertical rows, so a
// 3rd interval landed back on row 0 and collided with the 1st; and abnormality pin labels
// switched anchor at a fixed 60px clearance regardless of the label's own length.
describe('EcgStrip', () => {
  it('staggers 3+ interval labels across at least 3 rows instead of colliding on row 1', () => {
    const { container } = render(
      <EcgStrip
        intervals={[
          { label: 'PR', fromMs: 0, toMs: 160 },
          { label: 'QRS', fromMs: 160, toMs: 240 },
          { label: 'QT', fromMs: 160, toMs: 440 },
        ]}
      />,
    );
    const lbls = Array.from(container.querySelectorAll('text.c2-ecg-iv-lbl'));
    expect(lbls).toHaveLength(3);
    const ys = new Set(lbls.map((n) => n.getAttribute('y')));
    // Three intervals must not collapse onto just 2 distinct y-positions.
    expect(ys.size).toBeGreaterThanOrEqual(3);
  });

  it('gives a long abnormality label enough clearance before flipping anchor', () => {
    const { container } = render(
      <EcgStrip abnormalities={[{ atMs: 900, label: 'ST elevation in anterolateral leads' }]} />,
    );
    const lbl = container.querySelector('text.c2-ecg-pin-lbl');
    expect(lbl).toBeTruthy();
    // A long label near the right edge must anchor 'end' (grows leftward), not 'middle'
    // (which would still bleed past the strip on the right).
    expect(lbl!.getAttribute('text-anchor')).toBe('end');
  });

  it('renders normally with the default synthesized beat (no intervals/abnormalities)', () => {
    const { container } = render(<EcgStrip />);
    expect(container.querySelector('path.c2-ecg-trace')).toBeTruthy();
    expect(container.querySelectorAll('text.c2-ecg-iv-lbl')).toHaveLength(0);
  });
});

// Regression coverage for a real bug: category labels and the hover readout were positioned
// with no text-clipping constraint, sized against a small demo fixture. Once a group count (or
// a single label's length) grew past that fixture, labels collided into their neighbors and the
// hover tooltip — which followed the hot point's own x/y — could overlap an adjacent group.
describe('ErrorBars', () => {
  const W = 480; // must track ErrorBars.tsx's internal W — fixed-viewBox, not measured live.
  const H = 270;

  function groups(n: number, labelFor: (i: number) => string): ErrorGroup[] {
    return Array.from({ length: n }, (_, i) => ({
      label: labelFor(i),
      mean: 10 + i,
      ci: 2,
    }));
  }

  function xLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll('svg text.erb-xtick'));
  }

  it('keeps short-label spacing unchanged at a small demo-sized group count', () => {
    const { container } = render(
      <ErrorBars title="Trial results" groups={groups(4, (i) => `Grp ${i + 1}`)} />,
    );
    const labels = xLabels(container);
    expect(labels).toHaveLength(4);
    for (const l of labels) {
      expect(visibleText(l)).not.toMatch(/…$/);
    }
  });

  it('truncates category labels with an ellipsis once the group count grows well past the demo fixture', () => {
    const n = 14;
    const { container } = render(
      <ErrorBars title="Trial results" groups={groups(n, (i) => `Treatment group ${i + 1}`)} />,
    );
    const labels = xLabels(container);
    expect(labels).toHaveLength(n);
    // At 14 groups the per-slot budget is far narrower than "Treatment group N" — every label
    // must be clipped to a short, bounded budget instead of running past its neighbor's slot.
    for (const l of labels) {
      expect(visibleText(l).length).toBeLessThanOrEqual(10);
      expect(visibleText(l).endsWith('…')).toBe(true);
    }
    // The untruncated string is preserved as a native tooltip so nothing is silently lost.
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Treatment group 4');
  });

  it('truncates a single unusually long label even when the group count is small', () => {
    const data = groups(4, (i) => `Cat ${i + 1}`);
    data[1] = { label: 'A very long treatment name that would otherwise collide', mean: 12, ci: 2 };
    const { container } = render(<ErrorBars title="Trial results" groups={data} />);
    const labels = xLabels(container);
    const long = labels[1];
    expect(long).toBeTruthy();
    expect(visibleText(long).length).toBeLessThan(data[1].label.length);
    expect(visibleText(long).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain(data[1].label);
  });

  it('never lets a category label start outside the fixed viewBox at a high group count', () => {
    const n = 20;
    const { container } = render(
      <ErrorBars title="Trial results" groups={groups(n, (i) => `Group ${i + 1}`)} />,
    );
    const svg = container.querySelector('svg.erb-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);
    for (const l of xLabels(container)) {
      const x = Number(l.getAttribute('x'));
      const y = Number(l.getAttribute('y'));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(H);
    }
  });

  it('positions the hover readout at a fixed spot, not following the hot group, so it cannot collide with a neighbor', () => {
    const n = 12;
    const data = groups(n, (i) => `Group ${i + 1}`);
    const { container } = render(<ErrorBars title="Trial results" groups={data} />);
    const hitAreas = Array.from(container.querySelectorAll('svg rect[fill="transparent"]'));
    expect(hitAreas).toHaveLength(n);

    // Hover the first group.
    fireEvent.mouseEnter(hitAreas[0]);
    const tipFirst = container.querySelector('.erb-tip .erb-tip-mean');
    expect(tipFirst).toBeTruthy();
    const xFirst = tipFirst!.getAttribute('x');
    const yFirst = tipFirst!.getAttribute('y');

    // Hover the last group — a different point far across the chart.
    fireEvent.mouseEnter(hitAreas[n - 1]);
    const tipLast = container.querySelector('.erb-tip .erb-tip-mean');
    expect(tipLast).toBeTruthy();
    const xLast = tipLast!.getAttribute('x');
    const yLast = tipLast!.getAttribute('y');

    // The readout sits at the same fixed location regardless of which group is hot — it does
    // not track the hot point's own x/y, which is what let it collide with a neighboring
    // whisker or point when groups sat close together in a narrow slot.
    expect(xFirst).toBe(xLast);
    expect(yFirst).toBe(yLast);

    // Exactly one readout renders at a time.
    expect(container.querySelectorAll('.erb-tip').length).toBe(1);
  });

  it('renders no hover readout until a group is hot', () => {
    const { container } = render(
      <ErrorBars title="Trial results" groups={groups(5, (i) => `Group ${i + 1}`)} />,
    );
    expect(container.querySelector('.erb-tip')).toBeNull();
  });
});

// Regression coverage for a real bug: the hover tooltip was centered on the task bar via
// `left: ${left + width / 2}%` with no clamping, so a bar sitting near the timeline's right
// edge (start + span close to the column count) centered its tooltip past 100% — clipped by
// the card's overflow:hidden. Any task whose bar extends to (or past) the last column must
// still produce a tooltip that stays inside the track.
describe('Gantt', () => {
  // Ten columns — wider than the ~5-6 column demo fixture — so a last-column bar's unclamped
  // center (100 - 50/n percent) actually lands past the 92% clamp bound and would fail the
  // assertion below without the fix, rather than happening to still fit by coincidence.
  const cols = Array.from({ length: 10 }, (_, i) => `W${i + 1}`);

  function tasksEndingAt(lastCol: number): GanttTask[] {
    return [
      { name: 'Kickoff', start: 0, span: 1, pct: 100 },
      // Flush against the right edge — the exact shape that overflowed before clamping.
      { name: 'Final rollout', start: lastCol, span: 1, pct: 40 },
    ];
  }

  it('keeps the hover tooltip left offset within the track for a bar flush against the right edge', () => {
    const { container } = render(
      <Gantt title="Plan" cols={cols} tasks={tasksEndingAt(cols.length - 1)} />,
    );
    const bars = Array.from(container.querySelectorAll<HTMLButtonElement>('.c2-gantt-bar'));
    expect(bars).toHaveLength(2);
    const lastBar = bars[bars.length - 1];

    fireEvent.mouseEnter(lastBar);
    const tip = container.querySelector<HTMLElement>('.c2-gantt-tip');
    expect(tip).toBeTruthy();

    // The tooltip is centered via `transform: translateX(-50%)`, so its `left` percentage must
    // stay clear of both edges — otherwise half of it renders outside the card and gets clipped.
    const leftPct = parseFloat(tip!.style.left);
    expect(leftPct).toBeGreaterThanOrEqual(8);
    expect(leftPct).toBeLessThanOrEqual(92);
  });

  it('still centers the tooltip over bars nowhere near an edge', () => {
    const midTasks: GanttTask[] = [{ name: 'Design', start: 2, span: 1, pct: 60 }];
    const { container } = render(<Gantt title="Plan" cols={cols} tasks={midTasks} />);
    const bar = container.querySelector<HTMLButtonElement>('.c2-gantt-bar')!;
    fireEvent.mouseEnter(bar);
    const tip = container.querySelector<HTMLElement>('.c2-gantt-tip')!;
    const unit = 100 / cols.length;
    const expectedCenter = 2 * unit + unit / 2;
    expect(parseFloat(tip.style.left)).toBeCloseTo(expectedCenter, 5);
  });

  it('clamps every task in a long, edge-hugging schedule without leaving the track', () => {
    // A larger task list than the ~2-task demo fixture, deliberately packing tasks across the
    // full width including both extremes, to catch any per-index regression in the clamp.
    const longCols = Array.from({ length: 10 }, (_, i) => `Week ${i + 1}`);
    const tasks: GanttTask[] = Array.from({ length: 10 }, (_, i) => ({
      name: `Task ${i + 1}`,
      start: i,
      span: 1,
      pct: 50,
    }));
    const { container } = render(<Gantt title="Plan" cols={longCols} tasks={tasks} />);
    const bars = Array.from(container.querySelectorAll<HTMLButtonElement>('.c2-gantt-bar'));
    expect(bars).toHaveLength(10);

    for (const bar of bars) {
      fireEvent.mouseEnter(bar);
      const tip = container.querySelector<HTMLElement>('.c2-gantt-tip')!;
      const leftPct = parseFloat(tip.style.left);
      expect(leftPct).toBeGreaterThanOrEqual(8);
      expect(leftPct).toBeLessThanOrEqual(92);
      fireEvent.mouseLeave(bar);
    }
  });
});

// Regression coverage for three real bugs: every label the component parks in its plot margins
// (per-curve utility label, budget-line label, optimal-bundle readout) is plain SVG text with no
// wrap or clip, sized against the demo fixture's terse strings ("U₁", "budget", "(4, 6)"). A
// longer label than that fixture — a custom optimal.label, a verbose curve label, or a budget
// line whose intercept sits high on the Y-axis — must not bleed past the fixed 340×252 viewBox
// or climb into the y-axis title's row.
describe('IndifferenceCurve', () => {
  const W = 340; // must track IndifferenceCurve.tsx's internal W — fixed-viewBox, not measured live.
  const H = 252;
  const PAD_T = 14; // y-axis title baseline

  function curve(label: string, points: { x: number; y: number }[]): IdfCurve {
    return { label, points };
  }

  it('truncates a long curve label instead of letting it bleed past the viewBox', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('Marginal utility tier one — the low bundle', [
            { x: 1, y: 10 },
            { x: 5, y: 2 },
            { x: 10, y: 1 },
          ]),
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.idf-curve-lbl'));
    expect(labels).toHaveLength(1);
    // Short enough that, combined with its end-anchored x (clamped to W-3) and the bold 10px
    // font, it can't extend past either viewBox edge.
    expect(visibleText(labels[0]).length).toBeLessThanOrEqual(10);
    expect(visibleText(labels[0]).endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Marginal utility tier one — the low bundle');
  });

  it('leaves a short curve label untouched', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 10 },
            { x: 10, y: 1 },
          ]),
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('text.idf-curve-lbl'));
    expect(labels.map((n) => visibleText(n))).toEqual(['U₁']);
    expect(container.querySelector('title')).toBeNull();
  });

  it('keeps the optimal-bundle readout inside the frame with a long custom label', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₂', [
            { x: 1, y: 10 },
            { x: 12.5, y: 1 },
          ]),
        ]}
        optimal={{ x: 12, y: 1.2, label: 'Optimal bundle: 12 apples and 1.2 oranges' }}
      />,
    );
    const label = container.querySelector('text.idf-optimal-lbl');
    expect(label).toBeTruthy();
    const text = visibleText(label!);
    expect(text.length).toBeLessThanOrEqual(16);
    expect(text.endsWith('…')).toBe(true);
    const titles = Array.from(container.querySelectorAll('title')).map((t) => t.textContent);
    expect(titles).toContain('Optimal bundle: 12 apples and 1.2 oranges');
    // The point sits at the far right of the plot (x=12 against a ~13-wide window), so a long
    // label must have flipped to end-anchored and parked to the point's LEFT rather than
    // running its start-anchored x + text width past the viewBox's right edge.
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(Number(label!.getAttribute('x'))).toBeLessThanOrEqual(W - 3);
  });

  it('keeps a short optimal-bundle readout right of the point, unflipped', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₂', [
            { x: 1, y: 10 },
            { x: 6, y: 1 },
          ]),
        ]}
        optimal={{ x: 4, y: 3 }}
      />,
    );
    const label = container.querySelector('text.idf-optimal-lbl');
    expect(label).toBeTruthy();
    expect(visibleText(label!)).toBe('(4, 3)');
    expect(label!.getAttribute('text-anchor')).toBe('start');
  });

  it('clamps the budget label below the y-axis title baseline for a steep budget line', () => {
    // A budget line with a very high Y-intercept (income mostly buys good Y) puts its left
    // endpoint near the top of the frame, where the old fixed "-4" offset would print the
    // "budget" label above PAD_T and into the y-axis title's own row.
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 5 },
            { x: 5, y: 1 },
          ]),
        ]}
        budget={{ intercept: 500, slope: -5 }}
      />,
    );
    const label = container.querySelector('text.idf-budget-lbl');
    expect(label).toBeTruthy();
    expect(Number(label!.getAttribute('y'))).toBeGreaterThanOrEqual(PAD_T + 8);

    const axisTitle = Array.from(container.querySelectorAll('text.idf-axis-lbl')).find(
      (t) => visibleText(t) === 'Good Y',
    );
    expect(axisTitle).toBeTruthy();
    expect(Number(label!.getAttribute('y'))).toBeGreaterThan(Number(axisTitle!.getAttribute('y')));
  });

  it('renders every label within the fixed viewBox for a shallow budget line too', () => {
    const { container } = render(
      <IndifferenceCurve
        title="Consumer choice"
        curves={[
          curve('U₁', [
            { x: 1, y: 5 },
            { x: 5, y: 1 },
          ]),
        ]}
        budget={{ intercept: 3, slope: -0.5 }}
        optimal={{ x: 2, y: 2 }}
      />,
    );
    const svg = container.querySelector('svg.idf-svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);
    for (const el of container.querySelectorAll('text')) {
      const x = Number(el.getAttribute('x'));
      const y = Number(el.getAttribute('y'));
      if (Number.isFinite(x)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
      }
      if (Number.isFinite(y)) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      }
    }
  });
});

// Regression coverage: breakeven labels were always drawn at a fixed offset above the zero
// line, so a strategy with two breakevens close together on screen (a narrow butterfly/spread
// viewed over a wide price axis) printed both labels on top of each other.
describe('PayoffDiagram', () => {
  // A narrow long butterfly (strikes 490/500/510) plotted over a wide 0-1000 price axis puts
  // its two breakevens only a few price units apart — a small fraction of the visible width.
  const butterfly: OptionLeg[] = [
    { type: 'call', position: 'long', strike: 490, premium: 8 },
    { type: 'call', position: 'short', strike: 500, premium: 4, qty: 2 },
    { type: 'call', position: 'long', strike: 510, premium: 1 },
  ];

  it('staggers two close breakeven labels instead of stacking them', () => {
    const { container } = render(
      <PayoffDiagram title="Butterfly" legs={butterfly} priceMin={0} priceMax={1000} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pay-be-lbl'));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    const ys = new Set(labels.map((n) => n.getAttribute('y')));
    // Two breakevens landing within 44px of each other must not share the same label y.
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });

  it('leaves a single breakeven at its default position', () => {
    const single: OptionLeg[] = [{ type: 'call', position: 'long', strike: 100, premium: 5 }];
    const { container } = render(
      <PayoffDiagram title="Long call" legs={single} priceMin={80} priceMax={120} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pay-be-lbl'));
    expect(labels).toHaveLength(1);
  });
});

// Regression coverage for a real bug: a marker's label was drawn start-anchored at a fixed
// +5px offset from its point with no text-length constraint. A marker near the right edge
// (a very plausible "called-out point" position, e.g. the curve's endpoint) pushed its label
// past the SVG viewBox's right edge once the label had more than a few characters — the demo
// fixture's short labels never happened to trip it. The fix ellipsises long labels and picks
// whichever side of the point has more room, clamping the anchor so the rendered text never
// crosses the plot's inner padding regardless of which edge the point sits near.
describe('Plot', () => {
  const W = 320;
  const PAD = { l: 30, r: 40, t: 12 };
  const MK_CHAR_W = 5.2; // must track Plot.tsx's own estimate
  const MK_LABEL_MAX_CHARS = 26; // must track Plot.tsx's own truncation limit

  function markerLabel(container: HTMLElement) {
    return container.querySelector('.c2-plot-mk');
  }

  it.each(['Peak', 'Local maximum here', 'A very long descriptive callout label for this point'])(
    'keeps the marker label "%s" inside the viewBox at the right edge',
    (label) => {
      const markers: PlotMarker[] = [{ x: 10, y: 10, label }];
      const { container } = render(
        <Plot
          title="Growth"
          curves={[
            {
              label: 'f(x)',
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
              ],
            },
          ]}
          xDomain={[0, 10]}
          yDomain={[0, 10]}
          markers={markers}
        />,
      );
      const text = markerLabel(container);
      expect(text).toBeTruthy();
      // Long labels are ellipsised to a fixed cap so no single label can ever demand more
      // width than the plot has to give; short labels render verbatim.
      const expected =
        label.length > MK_LABEL_MAX_CHARS
          ? `${label.slice(0, MK_LABEL_MAX_CHARS - 1).trimEnd()}…`
          : label;
      expect(text!.textContent).toBe(expected);
      const x = Number.parseFloat(text!.getAttribute('x') ?? '');
      const anchor = text!.getAttribute('text-anchor');
      const estimatedWidth = expected.length * MK_CHAR_W;
      if (anchor === 'end') {
        // end-anchored text grows leftward from x — its rendered left edge must not cross the
        // left inner padding, and its anchor must not sit past the right inner padding.
        expect(x).toBeLessThanOrEqual(W - PAD.r + 0.5);
        expect(x - estimatedWidth).toBeGreaterThanOrEqual(PAD.l - 0.5);
      } else {
        // start-anchored text grows rightward from x — its rendered right edge must not cross
        // the right inner padding.
        expect(anchor).toBe('start');
        expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
      }
    },
  );

  it('keeps a long label on a left-edge marker inside the viewBox too', () => {
    const markers: PlotMarker[] = [
      { x: 0, y: 10, label: 'A very long descriptive callout label for this point' },
    ];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        xDomain={[0, 10]}
        yDomain={[0, 10]}
        markers={markers}
      />,
    );
    const text = markerLabel(container);
    expect(text).toBeTruthy();
    const x = Number.parseFloat(text!.getAttribute('x') ?? '');
    const anchor = text!.getAttribute('text-anchor');
    const estimatedWidth = text!.textContent!.length * MK_CHAR_W;
    // A left-edge point has more room to the right, so the label should stay start-anchored
    // and grow rightward — but must still not cross the right inner padding.
    expect(anchor).toBe('start');
    expect(x).toBeGreaterThanOrEqual(PAD.l - 0.5);
    expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
  });

  it('keeps a top-edge marker label from crossing above the plot frame', () => {
    const markers: PlotMarker[] = [{ x: 5, y: 10, label: 'Ceiling' }];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        xDomain={[0, 10]}
        yDomain={[0, 10]}
        markers={markers}
      />,
    );
    const text = markerLabel(container);
    expect(text).toBeTruthy();
    const y = Number.parseFloat(text!.getAttribute('y') ?? '');
    expect(y).toBeGreaterThanOrEqual(PAD.t);
  });

  it('renders no marker label element when a marker has no label', () => {
    const markers: PlotMarker[] = [{ x: 5, y: 5 }];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        markers={markers}
      />,
    );
    expect(markerLabel(container)).toBeNull();
  });
});

// Regression coverage for the skew/heavy-tails annotation's x-placement: it used to be pinned
// to the outlier point's plotted coordinate with only a fixed +/-2px pad toward the edge it was
// already anchored away from, and NO margin at all toward the edge its text actually grows into
// (end-anchored text grows left from x, start-anchored grows right) — a width-blind placement
// that only avoided clipping by the card's overflow:hidden because the demo fixture's outlier
// always happened to land with room to spare. These tests lock in the general guarantee instead:
// for any item count, the full rendered label — anchor position +/- its estimated width — must
// stay within the plot's inner padding, regardless of which edge the outlier sits near.
describe('QQPlot', () => {
  const W = 320;
  const PAD = { l: 48, r: 18 };

  function rightSkew(n: number): number[] {
    // Bottom 90% clustered near 0; the top decile is a large multiplicative blowout so the
    // residual from the IQR-fit reference line reliably clears the 'Right skew' threshold
    // regardless of how many points are in play.
    const nOutliers = Math.max(1, Math.round(n * 0.1));
    const vals: number[] = [];
    for (let i = 0; i < n - nOutliers; i++) vals.push(i / n);
    for (let i = 0; i < nOutliers; i++) vals.push(1000 * (i + 1));
    return vals;
  }

  function leftSkew(n: number): number[] {
    return rightSkew(n).map((v) => -v);
  }

  function italicAnnotation(container: HTMLElement) {
    return Array.from(container.querySelectorAll('svg > text')).find(
      (t) => t.getAttribute('font-style') === 'italic',
    );
  }

  it.each([5, 8, 15, 30, 60])(
    'keeps the "Right skew" annotation inside the plot frame at n=%i',
    (n) => {
      const { container } = render(<QQPlot title="Fit check" values={rightSkew(n)} />);
      const annot = italicAnnotation(container);
      expect(annot).toBeTruthy();
      expect(annot!.textContent).toBe('Right skew');
      const x = Number.parseFloat(annot!.getAttribute('x') ?? '');
      const anchor = annot!.getAttribute('text-anchor');
      // end-anchored text grows leftward from x — its rendered left edge must not cross the
      // left inner padding, and its anchor itself must not sit past the right inner padding.
      expect(anchor).toBe('end');
      expect(x).toBeLessThanOrEqual(W - PAD.r);
      const estimatedWidth = annot!.textContent!.length * 4.6;
      expect(x - estimatedWidth).toBeGreaterThanOrEqual(PAD.l - 0.5);
    },
  );

  it.each([5, 8, 15, 30, 60])(
    'keeps the "Left skew" annotation inside the plot frame at n=%i',
    (n) => {
      const { container } = render(<QQPlot title="Fit check" values={leftSkew(n)} />);
      const annot = italicAnnotation(container);
      expect(annot).toBeTruthy();
      expect(annot!.textContent).toBe('Left skew');
      const x = Number.parseFloat(annot!.getAttribute('x') ?? '');
      const anchor = annot!.getAttribute('text-anchor');
      // start-anchored text grows rightward from x — its rendered right edge must not cross
      // the right inner padding, and its anchor itself must not sit before the left padding.
      expect(anchor).toBe('start');
      expect(x).toBeGreaterThanOrEqual(PAD.l);
      const estimatedWidth = annot!.textContent!.length * 4.6;
      expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
    },
  );

  it('renders no annotation (and no overflow risk) for a roughly normal sample', () => {
    const values = [
      58, 61, 63, 65, 67, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 81, 83, 85, 88, 92,
    ];
    const { container } = render(<QQPlot title="Normality check" values={values} />);
    expect(italicAnnotation(container)).toBeUndefined();
  });

  it('sizes its own tick and axis type rather than inheriting the shrinking shared clamp', () => {
    // .cx-tick / .cx-axlbl size type in cqi against the CARD, which stacks a second shrink on top
    // of the viewBox scale and left every tick around 7.7px — under the 9px legibility floor. An
    // inline size beats the class and holds at any card width.
    const values = [58, 61, 63, 65, 67, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
    const { container } = render(<QQPlot title="Normality check" values={values} />);
    const labels = Array.from(
      container.querySelectorAll<SVGTextElement>('text.cx-tick, text.cx-axlbl'),
    );
    expect(labels.length).toBeGreaterThan(4);
    for (const el of labels) {
      expect(Number.parseFloat(el.style.fontSize)).toBeGreaterThanOrEqual(10);
    }
  });
});

// Regression coverage for a real bug: the row label <text> sits at a fixed x = PAD_L - 8
// (right-anchored into an 86px-wide left gutter) with no truncation, sized only for the demo
// fixture's longest label ("Winter squash", 13 chars). A longer real-data row label (a species
// name, a multi-word produce item) rendered wide enough to run past the SVG's left edge (x=0)
// instead of fitting inside the gutter — clipped or drawn off-canvas.
describe('SeasonBand', () => {
  function rowsWith(labels: string[]): SeasonRow[] {
    return labels.map((label) => ({
      label,
      windows: [{ from: 3, to: 6, kind: 'available' }],
    }));
  }

  it('leaves a short demo-fixture-sized row label untouched', () => {
    const { container } = render(
      <SeasonBand title="Produce" rows={rowsWith(['Tomatoes', 'Winter squash'])} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels.map((n) => visibleText(n))).toEqual(['Tomatoes', 'Winter squash']);
    expect(container.querySelectorAll('text.c2-sb-row-lbl title')).toHaveLength(0);
  });

  it('truncates a row label longer than the left-gutter can hold instead of overflowing it', () => {
    const longLabel = 'Gravitationally Anomalous Heirloom Squash';
    const { container } = render(
      <SeasonBand title="Produce" rows={rowsWith(['Tomatoes', longLabel])} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels).toHaveLength(2);

    const longNode = labels[1];
    const rendered = visibleText(longNode);
    // Every rendered row label must fit inside the fixed 86px-wide left gutter at the class's
    // 10px font-size — this is the exact ceiling the unbounded label blew past.
    expect(rendered.length).toBeLessThan(longLabel.length);
    expect(rendered.endsWith('…')).toBe(true);

    // Rendered text never starts left of the SVG's viewBox origin (x=0) — the concrete
    // "off-canvas" failure mode: an unclamped label's glyph run extending past x=0.
    const x = Number(longNode.getAttribute('x'));
    const approxWidth = rendered.length * 10 * 0.6; // same glyph-width heuristic as the fix
    expect(x - approxWidth).toBeGreaterThanOrEqual(0);

    // The full label is still available, via a native <title> tooltip.
    const title = longNode.querySelector('title');
    expect(title?.textContent).toBe(longLabel);
  });

  it('holds the truncation ceiling steady as more rows are added, not just at the demo fixture count', () => {
    const longLabel = 'Extraordinarily Long Multi-Word Produce Designation';
    const rows = rowsWith(Array.from({ length: 12 }, (_, i) => `${longLabel} ${i}`));
    const { container } = render(<SeasonBand title="Produce" rows={rows} />);
    const labels = Array.from(container.querySelectorAll('text.c2-sb-row-lbl'));
    expect(labels).toHaveLength(12);
    for (const node of labels) {
      const rendered = visibleText(node);
      expect(rendered.length).toBeLessThanOrEqual(13);
      expect(rendered.endsWith('…')).toBe(true);
    }
  });
});

// Regression coverage for a real bug: the chart used a fixed 200px height regardless of row
// count, so a bigger table than the ~3-row demo fixture packed every label pair into an
// ever-shrinking vertical slice — degrading into illegible overlap well before spreadLabels'
// min-gap nudging could compensate. The label container was also capped at a 46% max-width
// shared with the (much shorter) value column, so a long row label elided sooner than it needed
// to. Height now scales with row count, and the left label column has more room to breathe.
describe('Slopegraph', () => {
  function rows(n: number, longLabels = false): SlopeRow[] {
    return Array.from({ length: n }, (_, i) => ({
      label: longLabels
        ? `Quarterly regional revenue segment ${i + 1} (North America & EMEA)`
        : `Row ${i + 1}`,
      before: 50 + i,
      after: 50 + ((i * 7) % 5) - 2, // converges several rows to nearly the same value
    }));
  }

  it.each([3, 8, 14])('grows the chart height with row count instead of a fixed 200px', (n) => {
    const { container } = render(<Slopegraph title="Change" rows={rows(n)} />);
    const chart = container.querySelector<HTMLElement>('.c2-slope');
    expect(chart).toBeTruthy();
    const height = Number.parseFloat(chart!.style.height);
    // A fixed-200px chart could never grow past its own row demo; anything beyond the 3-row
    // baseline must claim visibly more vertical room per additional row.
    expect(height).toBeGreaterThanOrEqual(200);
    if (n > 3) expect(height).toBeGreaterThan(200);
  });

  it.each([8, 14])('spreads %i rows of left/right labels without illegible overlap', (n) => {
    const { container } = render(<Slopegraph title="Change" rows={rows(n)} />);
    const chart = container.querySelector<HTMLElement>('.c2-slope');
    const height = Number.parseFloat(chart!.style.height);

    for (const side of ['l', 'r']) {
      const labels = Array.from(container.querySelectorAll<HTMLElement>(`.c2-slope-lbl.${side}`));
      expect(labels).toHaveLength(n);
      // `top` is authored as a `%`; convert back to the same px space spreadLabels operates in
      // so overlap can be judged against its own minGap.
      const ys = labels
        .map((el) => (Number.parseFloat(el.style.top) / 100) * height)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(17 - 0.01);
      }
      // The whole spread stays within the chart's own height budget — no label pushed below
      // the visible card.
      expect(ys[ys.length - 1]).toBeLessThanOrEqual(height);
      expect(ys[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives a long row label more room than the 46%-wide value column needs', () => {
    const { container } = render(<Slopegraph title="Change" rows={rows(2, true)} />);
    const label = container.querySelector<HTMLElement>('.c2-slope-lbl.l');
    expect(label).toBeTruthy();
    const maxWidthPct = Number.parseFloat(label!.style.maxWidth);
    expect(maxWidthPct).toBeGreaterThan(46);
  });
});

// Regression coverage for a real bug: every label on the simplex was authored for a viewBox that
// renders SMALLER than 1:1 (380 user units into a ~320px card), so sizes chosen as if they were
// pixels — 8.5 for the edge ticks, 9.5 for zone/point labels — landed at 7.2–8.0px on screen,
// under the library's 9px legibility floor. Raising them puts the wrapped corner labels closer to
// the bottom of the viewBox, which is the second half of the contract pinned here.
describe('TernaryPlot', () => {
  // The floor the component authors to: 9px on screen ÷ the ~0.85 user-unit-to-px scale.
  const MIN_FS = 11.5;

  /** The drawing box the labels must stay inside, read from the component's own viewBox. */
  function viewBox(container: HTMLElement): { w: number; h: number } {
    // `.ter-svg` specifically — the card eyebrow carries an icon <svg> of its own.
    const [, , w, h] = container
      .querySelector('.ter-svg')!
      .getAttribute('viewBox')!
      .split(/\s+/)
      .map(Number);
    return { w, h };
  }

  const points: TernaryPoint[] = [
    { label: 'Raised bed', a: 18, b: 42, c: 40 },
    { label: 'Riverbank deposit', a: 8, b: 12, c: 80 },
  ];
  const zones: TernaryZone[] = [
    {
      label: 'Loam',
      vertices: [
        { a: 27, b: 45, c: 28 },
        { a: 7, b: 52, c: 41 },
        { a: 27, b: 23, c: 50 },
      ],
    },
  ];

  function renderPlot(axes: TernaryAxes) {
    return render(
      <TernaryPlot title="Soil texture" axes={axes} unit="%" points={points} zones={zones} />,
    );
  }

  it('authors every sized label at or above the legibility floor', () => {
    const { container } = renderPlot({ a: 'Clay', b: 'Sand', c: 'Silt' });
    const sized = Array.from(container.querySelectorAll('svg text[font-size]'));
    // Corner ×3, zone ×1, point ×2 — every label whose size the component picks itself.
    expect(sized.length).toBeGreaterThanOrEqual(6);
    for (const el of sized) {
      expect(Number.parseFloat(el.getAttribute('font-size')!)).toBeGreaterThanOrEqual(MIN_FS);
    }
  });

  it('sizes the edge ticks from CSS at the same floor', () => {
    // The ticks take their size from the stylesheet, which jsdom does not apply — assert the
    // CSS contract directly, the same way the tooltip-width rule is pinned above.
    const css = readFileSync(join(__dirname, '..', 'src/canvas/blocks/charts2/styles.css'), 'utf8');
    const tickRule = css.match(/\.c2 \.ter-tick\s*\{[^}]*\}/)?.[0] ?? '';
    const size = Number.parseFloat(tickRule.match(/font-size:\s*([\d.]+)px/)?.[1] ?? '0');
    expect(size).toBeGreaterThanOrEqual(MIN_FS);
  });

  const cornerCases: [name: string, axes: TernaryAxes][] = [
    ['short', { a: 'Clay', b: 'Sand', c: 'Silt' }],
    // Wraps both base corner labels onto a second line at the larger corner type.
    ['wrapped', { a: 'Clay fraction', b: 'Coarse sand fraction', c: 'Silt and finer' }],
  ];

  it.each(cornerCases)('keeps every %s corner label inside the viewBox', (_name, axes) => {
    const { container } = renderPlot(axes);
    const { w: W, h: H } = viewBox(container);
    const corners = Array.from(container.querySelectorAll('svg text.ter-corner'));
    expect(corners).toHaveLength(3);
    for (const corner of corners) {
      const fs = Number.parseFloat(corner.getAttribute('font-size')!);
      const spans = Array.from(corner.querySelectorAll('tspan'));
      expect(spans.length).toBeGreaterThan(0);
      for (const span of spans) {
        const x = Number.parseFloat(span.getAttribute('x')!);
        const y = Number.parseFloat(span.getAttribute('y')!);
        // Baseline plus the descender below it / ascender above it — the ink, not just the anchor.
        expect(y + fs * 0.25).toBeLessThanOrEqual(H);
        expect(y - fs).toBeGreaterThanOrEqual(0);
        // Corner labels are middle-anchored, so half the line grows either side of x.
        const half = estimateTextWidth(span.textContent ?? '', fs, true) / 2;
        expect(x - half).toBeGreaterThanOrEqual(0);
        expect(x + half).toBeLessThanOrEqual(W);
      }
    }
  });
});
