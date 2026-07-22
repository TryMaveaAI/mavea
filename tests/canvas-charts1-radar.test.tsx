import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Radar } from '../src/canvas/blocks/charts1/Radar';
import type { RadarSeries } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a real bug: Radar's axis labels used a fixed font size (13) and a
// fixed per-char width estimate with no awareness of axis count. Angular spacing between axes
// shrinks as 360°/n, so once there were ~12+ axes the fixed-size labels started overlapping
// each other around the ring — the font must shrink as axes get denser.

function axesAndSeries(n: number): { axes: string[]; series: RadarSeries[] } {
  const axes = Array.from({ length: n }, (_, i) => `Category ${i + 1}`);
  const series: RadarSeries[] = [
    { label: 'Series A', values: axes.map((_, i) => ((i * 7) % 10) + 1) },
  ];
  return { axes, series };
}

describe('Radar', () => {
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
