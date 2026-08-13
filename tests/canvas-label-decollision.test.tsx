// Inline series labels are anchored at their own series' height, which reads well while the
// series are apart and collapses the moment they CONVERGE — two complexity curves both clipped at
// the plot ceiling, two harmonics crossing equilibrium together, five long station names sharing a
// narrow band. Each of those shipped as a chart whose labels sat unreadably on top of each other.
//
// These lock the de-collision in: the shared ladder helper, and the three charts that use it.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { spreadLabels } from '../src/canvas/lib/spreadLabels';
import { BigO } from '../src/canvas/blocks/charts2/BigO';
import { LineBalance } from '../src/canvas/blocks/charts2/LineBalance';
import { WaveDiagram } from '../src/canvas/blocks/learn/WaveDiagram';
import { GelLane } from '../src/canvas/blocks/charts2/GelLane';

/** Every label's y, in document order, from a rendered container. */
function ys(container: HTMLElement, selector: string): number[] {
  return [...container.querySelectorAll(selector)].map((el) =>
    Number.parseFloat(el.getAttribute('y') ?? 'NaN'),
  );
}

/** The tightest vertical gap between any two labels — the number that decides legibility. */
function tightestGap(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i] - sorted[i - 1]);
  return min;
}

describe('spreadLabels', () => {
  it('separates anchors that land on the same y', () => {
    const out = spreadLabels(
      [
        { id: 'a', y: 100 },
        { id: 'b', y: 100 },
        { id: 'c', y: 100 },
      ],
      { gap: 10, top: 0, bottom: 300 },
    );
    expect(tightestGap([...out.values()])).toBeGreaterThanOrEqual(10);
  });

  it('leaves already-separated anchors where they are', () => {
    const out = spreadLabels(
      [
        { id: 'a', y: 20 },
        { id: 'b', y: 60 },
      ],
      { gap: 10, top: 0, bottom: 300 },
    );
    expect(out.get('a')).toBe(20);
    expect(out.get('b')).toBe(60);
  });

  it('preserves the anchors’ vertical order, so labels still match their series', () => {
    const out = spreadLabels(
      [
        { id: 'low', y: 12 },
        { id: 'mid', y: 14 },
        { id: 'high', y: 16 },
      ],
      { gap: 20, top: 0, bottom: 300 },
    );
    expect(out.get('low')!).toBeLessThan(out.get('mid')!);
    expect(out.get('mid')!).toBeLessThan(out.get('high')!);
  });

  it('keeps every label inside the plot band', () => {
    const out = spreadLabels(
      [
        { id: 'a', y: -50 },
        { id: 'b', y: 400 },
        { id: 'c', y: 401 },
      ],
      { gap: 10, top: 10, bottom: 200 },
    );
    for (const y of out.values()) {
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(200);
    }
  });

  it('compresses rather than overflowing when the band cannot hold every label', () => {
    const anchors = Array.from({ length: 10 }, (_, i) => ({ id: i, y: 50 }));
    const out = spreadLabels(anchors, { gap: 20, top: 0, bottom: 50 });
    expect(out.size).toBe(10);
    for (const y of out.values()) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(50);
    }
  });

  it('handles an empty set', () => {
    expect(spreadLabels([], { gap: 10, top: 0, bottom: 100 }).size).toBe(0);
  });
});

describe('BigO curve labels', () => {
  it('gives every complexity class its own readable line', () => {
    // All six classes at once: O(1) and O(log n) both hug the floor and O(n²)/O(2ⁿ) both clip at
    // the ceiling, which is exactly what used to stack four labels into two piles.
    const { container } = render(<BigO title="Growth" maxN={16} />);
    const labels = ys(container, '.bgo-curve-lbl');
    expect(labels).toHaveLength(6);
    expect(tightestGap(labels)).toBeGreaterThanOrEqual(13);
  });

  it('does not give two classes the same colour', () => {
    const { container } = render(<BigO title="Growth" maxN={16} />);
    const fills = [...container.querySelectorAll('.bgo-curve-lbl')].map((el) =>
      el.getAttribute('fill'),
    );
    expect(new Set(fills).size).toBe(fills.length);
  });
});

describe('LineBalance station labels', () => {
  const longNames = [
    'Panel cut + edge-band',
    'Dowel + glue-up',
    'Clamp + cure',
    'Hardware install',
    'Inspect + pack',
  ];

  it('wraps long station names instead of overrunning their band', () => {
    const { container } = render(
      <LineBalance
        title="Station balance"
        takt={90}
        unit="s"
        stations={longNames.map((name, i) => ({ name, cycleTime: 70 + i * 8 }))}
      />,
    );
    // A wrapped label lives in one <tspan> per line, so rejoin them to recover the station name.
    const labels = [...container.querySelectorAll('text.cx-tick')]
      .map((el) => ({
        el,
        name: [...el.querySelectorAll('tspan')].map((t) => (t.textContent ?? '').trim()).join(' '),
      }))
      .filter(({ name }) => longNames.includes(name));
    expect(labels).toHaveLength(longNames.length);
    // The longest name cannot fit one band on its own, so it must have wrapped.
    const wrapped = labels.filter(({ el }) => el.querySelectorAll('tspan').length > 1);
    expect(wrapped.length).toBeGreaterThan(0);
  });

  it('never shrinks a station label below the legibility floor', () => {
    const { container } = render(
      <LineBalance
        title="Station balance"
        takt={90}
        stations={longNames.map((name, i) => ({ name, cycleTime: 70 + i * 8 }))}
      />,
    );
    for (const el of container.querySelectorAll('text.cx-tick[style]')) {
      const size = Number.parseFloat(
        (el as SVGTextElement).style.fontSize.replace('px', '') || 'NaN',
      );
      if (Number.isFinite(size)) expect(size).toBeGreaterThanOrEqual(9);
    }
  });

  it('still renders a single line for short names', () => {
    const { container } = render(
      <LineBalance
        title="Station balance"
        takt={90}
        stations={[
          { name: 'Cut', cycleTime: 40 },
          { name: 'Sand', cycleTime: 55 },
        ]}
      />,
    );
    const short = [...container.querySelectorAll('text.cx-tick')].filter((el) =>
      ['Cut', 'Sand'].includes((el.textContent ?? '').trim()),
    );
    expect(short).toHaveLength(2);
    for (const el of short) expect(el.querySelectorAll('tspan')).toHaveLength(1);
  });
});

describe('GelLane ladder labels', () => {
  // A log scale bunches the high end: 1,500/1,000/900/800/700 land within a few units of each
  // other, so a label on every tick collides however the ticks are spaced.
  const marks = [1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

  it('draws every tick line but only the labels that fit', () => {
    const { container } = render(
      <GelLane title="Gel" ladder={{ marks, unit: 'bp' }} lanes={[{ label: 'A', bands: [] }]} />,
    );
    expect(container.querySelectorAll('.c2-gel-tick')).toHaveLength(marks.length);
    const labels = container.querySelectorAll('.c2-gel-tick-lbl');
    // Some labels are dropped — but never so many that the ladder stops being a scale.
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.length).toBeLessThan(marks.length);
  });

  it('keeps the extremes, which are what bound the range', () => {
    const { container } = render(
      <GelLane title="Gel" ladder={{ marks, unit: 'bp' }} lanes={[{ label: 'A', bands: [] }]} />,
    );
    const texts = [...container.querySelectorAll('.c2-gel-tick-lbl')].map((el) =>
      (el.textContent ?? '').trim(),
    );
    expect(texts[0]).toContain('1,500');
    expect(texts[texts.length - 1]).toContain('100');
  });

  it('labels every tick when they are far enough apart', () => {
    const sparse = [1000, 100, 10];
    const { container } = render(
      <GelLane
        title="Gel"
        ladder={{ marks: sparse, unit: 'bp' }}
        lanes={[{ label: 'A', bands: [] }]}
      />,
    );
    expect(container.querySelectorAll('.c2-gel-tick-lbl')).toHaveLength(sparse.length);
  });
});

describe('WaveDiagram labels', () => {
  it('separates the labels of waves that end at the same displacement', () => {
    // A fundamental and its 2nd harmonic both return to equilibrium at the span's end, so both
    // labels want the identical y.
    const { container } = render(
      <WaveDiagram
        title="Standing wave"
        waves={[
          { label: 'A4 (440 Hz)', amplitude: 1, wavelength: 1, phase: 0 },
          { label: '2nd harmonic', amplitude: 1, wavelength: 0.5, phase: 0 },
        ]}
      />,
    );
    const labels = ys(container, '.wv-curve-lbl');
    expect(labels).toHaveLength(2);
    expect(tightestGap(labels)).toBeGreaterThanOrEqual(11);
  });

  it('keeps the x-axis unit clear of the curve labels', () => {
    const { container } = render(
      <WaveDiagram
        title="Standing wave"
        xUnit="distance (m)"
        waves={[{ label: 'A4 (440 Hz)', amplitude: 1, wavelength: 1, phase: 0 }]}
      />,
    );
    const axis = container.querySelector('.wv-axis-lbl');
    const curve = container.querySelector('.wv-curve-lbl');
    expect(axis?.textContent).toBe('distance (m)');
    // The unit now sits under the tick row; a curve label can never reach that far down.
    const axisY = Number.parseFloat(axis?.getAttribute('y') ?? 'NaN');
    const curveY = Number.parseFloat(curve?.getAttribute('y') ?? 'NaN');
    expect(axisY).toBeGreaterThan(curveY + 11);
  });
});
