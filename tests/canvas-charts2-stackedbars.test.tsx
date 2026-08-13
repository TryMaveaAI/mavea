import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StackedBars } from '../src/canvas/blocks/charts2/StackedBars';
import { estimateTextWidth } from '../src/canvas/lib/fitText';
import type { StackedBarsProps, StackSeries } from '../src/canvas/blocks/charts2/types';

// StackedBars draws into a FIXED viewBox, so every geometry assertion below is checked against
// these numbers rather than a live measurement. They must track StackedBars.tsx.
const W = 380;
const H = 240;
const PAD_TOP = 18;
const PAD_BOTTOM = 30;
const PAD_BOTTOM_TILTED = 54;
const TILT = 40;
const TILT_SIN = Math.sin((TILT * Math.PI) / 180);
const TILT_COS = Math.cos((TILT * Math.PI) / 180);
const TICK_FS = 9.5;
const VAL_FS = 9.5;
/** The plot height for a horizontal / a tilted category axis. */
const INNER_H = H - PAD_TOP - PAD_BOTTOM;
const INNER_H_TILTED = H - PAD_TOP - PAD_BOTTOM_TILTED;
/** Two labels closer than one glyph height read as a smear. The component thins to a full line
 *  box (1.15em), so this floor leaves headroom without pinning the exact stride. */
const LEGIBLE_SEP = TICK_FS;

// A <title> tooltip nested inside a <text> node is part of its DOM textContent too, so reading
// the actually-rendered glyphs means the node's own direct text children, not the <title>'s.
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

function num(el: Element, attr: string): number {
  return Number(el.getAttribute(attr));
}

/** The plot group's origin — the left gutter is measured from the tick labels, so it moves. */
function padLeft(container: HTMLElement): number {
  const g = container.querySelector('svg.c2-stk-svg > g');
  const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(g?.getAttribute('transform') ?? '');
  expect(m).toBeTruthy();
  expect(Number(m?.[2])).toBe(PAD_TOP);
  return Number(m?.[1]);
}

interface CatLabel {
  x: number;
  y: number;
  text: string;
  full: string;
  tilted: boolean;
}

function catLabels(container: HTMLElement): CatLabel[] {
  return Array.from(container.querySelectorAll('text.c2-stk-cat')).map((el) => ({
    x: num(el, 'x'),
    y: num(el, 'y'),
    text: visibleText(el),
    full: el.querySelector('title')?.textContent ?? '',
    tilted: (el.getAttribute('transform') ?? '').includes('rotate'),
  }));
}

function columns(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('g.m-stagger-item'));
}

function segments(column: Element): Element[] {
  return Array.from(column.querySelectorAll('rect'));
}

function tickTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('text.cx-tick:not(.c2-stk-cat)')).map((t) =>
    visibleText(t),
  );
}

/** The whole point of the thinning stride: whatever the group count, no two drawn category
 *  labels may overprint, and none may fall outside the viewBox (`.c2-stk-wrap` clips). Tilted
 *  labels are parallel lines, so their real separation is the horizontal gap × sin(tilt). */
function expectLabelsReadable(container: HTMLElement): CatLabel[] {
  const labels = catLabels(container);
  const padL = padLeft(container);
  for (let i = 1; i < labels.length; i++) {
    const a = labels[i - 1];
    const b = labels[i];
    const dx = Math.abs(b.x - a.x);
    if (b.tilted) {
      expect(dx * TILT_SIN).toBeGreaterThanOrEqual(LEGIBLE_SEP);
    } else {
      const halves = (estimateTextWidth(a.text, TICK_FS) + estimateTextWidth(b.text, TICK_FS)) / 2;
      expect(dx).toBeGreaterThanOrEqual(halves);
    }
  }
  for (const l of labels) {
    const w = estimateTextWidth(l.text, TICK_FS);
    // Tilted text is right-anchored and reaches back-and-down from (x, y); horizontal text is
    // centred on x.
    const left = l.tilted ? padL + l.x - w * TILT_COS : padL + l.x - w / 2;
    const right = l.tilted ? padL + l.x : padL + l.x + w / 2;
    const bottom = PAD_TOP + l.y + (l.tilted ? w * TILT_SIN : 3);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(W);
    expect(bottom).toBeLessThanOrEqual(H);
  }
  return labels;
}

function months(n: number): string[] {
  // 12-char month-and-year labels: the realistic dense case a monthly series arrives with.
  const names = ['January', 'February', 'March', 'April', 'May', 'June'];
  return Array.from({ length: n }, (_, i) => `${names[i % names.length]} ${2020 + (i % 6)}`);
}

function flatSeries(names: string[], count: number, value: number): StackSeries[] {
  return names.map((name) => ({ name, data: Array.from({ length: count }, () => value) }));
}

describe('StackedBars — normalisation', () => {
  it('normalises every column to the full plot height in percent mode', () => {
    const { container } = render(
      <StackedBars
        title="Mix"
        mode="percent"
        groups={['A', 'B']}
        series={[
          { name: 'x', data: [10, 1] },
          { name: 'y', data: [30, 1] },
        ]}
      />,
    );
    const cols = columns(container);
    expect(cols).toHaveLength(2);
    for (const col of cols) {
      const total = segments(col).reduce((sum, r) => sum + num(r, 'height'), 0);
      expect(total).toBeCloseTo(INNER_H, 3);
    }
    // A 10/30 split and a 1/1 split read as shares, not as magnitudes.
    expect(segments(cols[0]).map((r) => num(r, 'height'))).toEqual([
      INNER_H * 0.25,
      INNER_H * 0.75,
    ]);
    expect(
      Array.from(cols[0].querySelectorAll('text.c2-stk-val')).map((t) => visibleText(t)),
    ).toEqual(['25%', '75%']);
  });

  it('prints the real total above a normalised column so the magnitude survives', () => {
    const { container } = render(
      <StackedBars
        title="Mix"
        mode="percent"
        unit="$"
        groups={['A', 'B']}
        series={[
          { name: 'x', data: [10, 1] },
          { name: 'y', data: [30, 1] },
        ]}
      />,
    );
    expect(
      Array.from(container.querySelectorAll('text.c2-stk-total')).map((t) => visibleText(t)),
    ).toEqual(['$40', '$2']);
  });

  it('keeps column heights proportional to their totals in absolute mode', () => {
    const { container } = render(
      <StackedBars title="Totals" groups={['A', 'B']} series={[{ name: 'x', data: [10, 30] }]} />,
    );
    const [a, b] = columns(container).map((c) =>
      segments(c).reduce((sum, r) => sum + num(r, 'height'), 0),
    );
    expect(b / a).toBeCloseTo(3, 5);
    // The axis is nice-rounded to 30, so the taller column fills the plot exactly.
    expect(b).toBeCloseTo(INNER_H, 3);
  });
});

describe('StackedBars — negative-value policy', () => {
  it('counts a negative as zero, draws nothing for it, and declares the drop', () => {
    const { container } = render(
      <StackedBars
        title="Hours"
        groups={['A', 'B']}
        series={[
          { name: 'x', data: [10, -5] },
          { name: 'y', data: [20, 30] },
        ]}
      />,
    );
    expect(segments(columns(container)[0])).toHaveLength(2);
    expect(segments(columns(container)[1])).toHaveLength(1);
    expect(container.querySelector('.c2-stk-note')?.textContent).toContain('1 negative value');
    // The excluded value is not in the total either.
    expect(
      Array.from(container.querySelectorAll('text.c2-stk-total')).map((t) => visibleText(t)),
    ).toEqual(['30', '30']);
  });

  it('pluralises the declaration for more than one dropped value', () => {
    const { container } = render(
      <StackedBars
        title="Hours"
        groups={['A', 'B']}
        series={[
          { name: 'x', data: [-1, -5] },
          { name: 'y', data: [20, 30] },
        ]}
      />,
    );
    expect(container.querySelector('.c2-stk-note')?.textContent).toContain('2 negative values');
  });

  it('falls back to the empty state when every value is negative', () => {
    const { container } = render(
      <StackedBars title="Hours" groups={['A', 'B']} series={[{ name: 'x', data: [-1, -5] }]} />,
    );
    expect(container.querySelector('.cx-empty')).toBeTruthy();
    expect(container.querySelector('svg.c2-stk-svg')).toBeNull();
  });
});

describe('StackedBars — category-label thinning', () => {
  it('labels every column while the labels fit their own band', () => {
    const groups = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const { container } = render(
      <StackedBars title="Year" groups={groups} series={flatSeries(['x'], groups.length, 100)} />,
    );
    const labels = expectLabelsReadable(container);
    expect(labels.map((l) => l.text)).toEqual(groups);
    expect(labels.every((l) => !l.tilted)).toBe(true);
  });

  it('thins the labels at 24 dense groups instead of smearing them together', () => {
    const groups = months(24);
    const { container } = render(
      <StackedBars title="Two years" groups={groups} series={flatSeries(['x'], 24, 100)} />,
    );
    const labels = expectLabelsReadable(container);
    expect(columns(container)).toHaveLength(24);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.length).toBeLessThan(24);
    // The axis extent still reads: the first and last categories are always labelled.
    expect(labels[0].full).toBe(groups[0]);
    expect(labels[labels.length - 1].full).toBe(groups[23]);
    expect(labels.every((l) => l.tilted)).toBe(true);
  });

  it.each([1, 2, 3, 5, 12, 20, 24, 40, 300])('keeps the axis legible at %i groups', (n) => {
    const groups = months(n);
    const { container, unmount } = render(
      <StackedBars title="Stress" groups={groups} series={flatSeries(['x', 'y'], n, 40)} />,
    );
    const labels = expectLabelsReadable(container);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[labels.length - 1].full).toBe(groups[n - 1]);
    unmount();
  });

  it('shortens a label that cannot fit its gutter but keeps the full text reachable', () => {
    const long = 'Enterprise Platform Modernisation Programme, Phase Two';
    const { container } = render(
      <StackedBars
        title="Programmes"
        groups={[long, 'Other', 'Rest']}
        series={[{ name: 'spend', data: [10, 20, 30] }]}
      />,
    );
    const [first] = expectLabelsReadable(container);
    expect(first.text.endsWith('…')).toBe(true);
    expect(first.text.length).toBeLessThan(long.length);
    expect(first.full).toBe(long);
  });

  it('renders a model-authored label as text, never as markup', () => {
    const hostile = '<script>alert(1)</script> Q1';
    const { container } = render(
      <StackedBars title="Escaping" groups={[hostile]} series={[{ name: 'x', data: [10] }]} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(catLabels(container)[0].full).toBe(hostile);
  });
});

describe('StackedBars — value labels', () => {
  it('only labels a segment tall enough and wide enough to hold the text', () => {
    const { container } = render(
      <StackedBars
        title="Split"
        mode="percent"
        groups={['A']}
        series={[
          { name: 'big', data: [99] },
          { name: 'tiny', data: [1] },
        ]}
      />,
    );
    const col = columns(container)[0];
    expect(segments(col)).toHaveLength(2);
    const vals = Array.from(col.querySelectorAll('text.c2-stk-val'));
    expect(vals.map(visibleText)).toEqual(['99%']);
  });

  it('never draws a value label wider or taller than the segment carrying it', () => {
    const { container } = render(
      <StackedBars
        title="Crowded"
        unit="$"
        groups={['Alpha', 'Beta', 'Gamma', 'Delta']}
        series={[
          { name: 'a', data: [1200, 40, 900, 15] },
          { name: 'b', data: [90, 2000, 12, 700] },
          { name: 'c', data: [300, 8, 450, 1100] },
        ]}
      />,
    );
    for (const col of columns(container)) {
      for (const part of Array.from(col.querySelectorAll('g.c2-stk-part'))) {
        const rect = part.querySelector('rect');
        const label = part.querySelector('text.c2-stk-val');
        if (!rect || !label) continue;
        const half = estimateTextWidth(visibleText(label), VAL_FS, true) / 2;
        expect(num(label, 'x') - half).toBeGreaterThanOrEqual(num(rect, 'x'));
        expect(num(label, 'x') + half).toBeLessThanOrEqual(num(rect, 'x') + num(rect, 'width'));
        expect(num(rect, 'height')).toBeGreaterThanOrEqual(13);
      }
    }
  });
});

describe('StackedBars — axis and unit', () => {
  it('carries the unit on the axis ticks, the same way the column caps do', () => {
    const { container } = render(
      <StackedBars
        title="Revenue"
        unit="$"
        groups={['Q1', 'Q2']}
        series={[{ name: 'x', data: [1000, 3480] }]}
      />,
    );
    const ticks = tickTexts(container);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((t) => t.startsWith('$'))).toBe(true);
    expect(
      Array.from(container.querySelectorAll('text.c2-stk-total')).map((t) => visibleText(t)),
    ).toEqual(['$1,000', '$3,480']);
  });

  it('drops a unit too wide for the gutter from the AXIS only', () => {
    const { container } = render(
      <StackedBars
        title="Energy"
        unit="kilowatt hours"
        groups={['Q1', 'Q2']}
        series={[{ name: 'x', data: [1000, 3480] }]}
      />,
    );
    const ticks = tickTexts(container);
    expect(ticks.every((t) => /^[\d,]+$/.test(t))).toBe(true);
    // The unit still reads on every column cap, so nothing is lost.
    const caps = Array.from(container.querySelectorAll('text.c2-stk-total')).map((t) =>
      visibleText(t),
    );
    expect(caps.every((c) => c.includes('kilowatt hours'))).toBe(true);
    expect(padLeft(container)).toBeLessThanOrEqual(96);
  });

  it('keeps the widest tick label inside the measured gutter', () => {
    for (const unit of ['', '$', '%', 'hours']) {
      const { container, unmount } = render(
        <StackedBars
          title="Gutter"
          unit={unit}
          groups={['Q1', 'Q2']}
          series={[{ name: 'x', data: [12000, 34800] }]}
        />,
      );
      const padL = padLeft(container);
      for (const t of tickTexts(container)) {
        // Ticks are end-anchored at x = -6 inside the plot group.
        expect(padL - 6 - estimateTextWidth(t, TICK_FS)).toBeGreaterThanOrEqual(0);
      }
      unmount();
    }
  });

  it('labels the value axis in percent points when the columns are normalised', () => {
    const { container } = render(
      <StackedBars
        title="Mix"
        mode="percent"
        unit="$"
        groups={['A']}
        series={[
          { name: 'x', data: [10] },
          { name: 'y', data: [30] },
        ]}
      />,
    );
    expect(tickTexts(container)).toEqual(['0%', '25%', '50%', '75%', '100%']);
  });
});

describe('StackedBars — colours', () => {
  it('ignores a colour outside the design system rather than passing it to fill', () => {
    const loose = {
      title: 'Loose JSON',
      groups: ['A'],
      series: [
        { name: 'hex', color: '#e11', data: [10] },
        { name: 'named', color: 'red', data: [10] },
        { name: 'injected', color: 'url(#x)', data: [10] },
        { name: 'token', color: 'var(--insight)', data: [10] },
      ],
    } as unknown as StackedBarsProps;
    const { container } = render(<StackedBars {...loose} />);
    const fills = segments(columns(container)[0]).map((r) => r.getAttribute('fill') ?? '');
    expect(fills).toHaveLength(4);
    expect(fills.every((f) => /^var\(--[a-z-]+\)$/.test(f))).toBe(true);
    expect(fills[3]).toBe('var(--insight)');
    // The legend swatches read from the same guarded colour.
    const swatches = Array.from(container.querySelectorAll('.cx-leg i')).map(
      (i) => (i as HTMLElement).style.background,
    );
    expect(swatches.every((s) => s.startsWith('var(--'))).toBe(true);
  });
});

describe('StackedBars — degenerate data', () => {
  it('does not stretch a lone column across the whole plot', () => {
    const { container } = render(
      <StackedBars title="One" groups={['Only']} series={[{ name: 'x', data: [10] }]} />,
    );
    const rect = segments(columns(container)[0])[0];
    expect(num(rect, 'width')).toBeLessThanOrEqual(46);
    expect(num(rect, 'width')).toBeGreaterThan(0);
  });

  it('draws nothing for a zero segment and never emits a NaN coordinate', () => {
    const { container } = render(
      <StackedBars
        title="Zeroes"
        groups={['A', 'B']}
        series={[
          { name: 'x', data: [0, 12] },
          { name: 'y', data: [8, 0] },
        ]}
      />,
    );
    for (const col of columns(container)) {
      expect(segments(col)).toHaveLength(1);
    }
    for (const el of Array.from(container.querySelectorAll('rect, text, line'))) {
      for (const attr of ['x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2']) {
        const raw = el.getAttribute(attr);
        if (raw !== null) expect(Number.isFinite(Number(raw))).toBe(true);
      }
    }
  });

  it('treats a series shorter than groups as zero rather than dropping the chart', () => {
    const { container } = render(
      <StackedBars title="Ragged" groups={['A', 'B', 'C']} series={[{ name: 'x', data: [10] }]} />,
    );
    expect(columns(container)).toHaveLength(3);
    expect(segments(columns(container)[0])).toHaveLength(1);
    expect(segments(columns(container)[1])).toHaveLength(0);
    expect(container.querySelector('.cx-empty')).toBeNull();
  });

  it('renders with only the required props', () => {
    const { container } = render(
      <StackedBars title="Bare" groups={['A', 'B']} series={[{ name: 'x', data: [1, 2] }]} />,
    );
    expect(container.querySelector('svg.c2-stk-svg')).toBeTruthy();
    expect(container.querySelector('.cx-axlbl')).toBeNull();
    expect(container.querySelector('.c2-stk-note')).toBeNull();
  });

  it('deepens the gutter for a tilted axis so the labels have somewhere to go', () => {
    const short = render(
      <StackedBars title="Short" groups={['A', 'B']} series={[{ name: 'x', data: [1, 1] }]} />,
    );
    const axisY = (c: HTMLElement) => num(c.querySelectorAll('line.cx-axis-l')[0], 'y1');
    expect(axisY(short.container)).toBeCloseTo(INNER_H, 3);
    short.unmount();

    const tilted = render(
      <StackedBars
        title="Long"
        groups={months(8)}
        series={[{ name: 'x', data: Array(8).fill(1) }]}
      />,
    );
    expect(axisY(tilted.container)).toBeCloseTo(INNER_H_TILTED, 3);
    expect(catLabels(tilted.container).every((l) => l.tilted)).toBe(true);
  });

  it.each([
    ['no groups', { title: 'Empty', groups: [], series: [{ name: 'x', data: [1] }] }],
    ['no series', { title: 'Empty', groups: ['A'], series: [] }],
    ['non-array props', { title: 'Empty', groups: 'A, B', series: 'x' }],
    ['non-numeric data', { title: 'Empty', groups: ['A'], series: [{ name: 'x', data: ['n/a'] }] }],
  ])('shows the empty state for %s', (_label, props) => {
    const { container } = render(<StackedBars {...(props as unknown as StackedBarsProps)} />);
    expect(container.querySelector('.cx-empty')).toBeTruthy();
  });
});
