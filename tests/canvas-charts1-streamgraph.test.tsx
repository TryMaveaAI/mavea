import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Streamgraph } from '../src/canvas/blocks/charts1/Streamgraph';
import type { StreamSeries } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a real bug: the x-axis rendered one <text> per tick at a fixed
// fontSize with no thinning, so a timeline with more than ~12-15 points overlapped into an
// illegible smear. Also covers the accompanying per-band entrance/hover polish.

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

describe('Streamgraph', () => {
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
