import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarChart } from '../src/canvas/BarChart';
import { spreadOrder, thinLabels } from '../src/canvas/lib/thinLabels';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// A row laid out the way `.bars-plot` lays it out: n columns sharing the width with a 10px gap,
// each value centred over its column at the floor size (10px, tabular figures ~0.62em each).
function layOut(values: string[], width: number) {
  const gap = 10;
  const col = (width - gap * (values.length - 1)) / values.length;
  return values.map((v, i) => {
    const centre = i * (col + gap) + col / 2;
    const w = v.length * 0.62 * 10;
    return { left: centre - w / 2, right: centre + w / 2 };
  });
}

const overlaps = (a: { left: number; right: number }, b: { left: number; right: number }) =>
  a.left < b.right && b.left < a.right;

describe('a crowded bar chart thins its values instead of piling them up', () => {
  const values = Array.from({ length: 30 }, (_, i) => (1000 + i * 137).toLocaleString('en-US'));

  it('keeps only values that clear each other, spread across the row', () => {
    const spans = layOut(values, 340);
    // As laid out, every value collides with its neighbour.
    expect(overlaps(spans[0], spans[1])).toBe(true);
    const tallest = 29;
    const kept = [...thinLabels(spans, spreadOrder(30, [tallest, 0, 0, 29]))].sort((a, b) => a - b);
    for (let i = 0; i < kept.length; i++)
      for (let j = i + 1; j < kept.length; j++)
        expect(overlaps(spans[kept[i]], spans[kept[j]])).toBe(false);
    // The figure the chart calls out and both ends are always drawn…
    expect(kept).toEqual(expect.arrayContaining([0, 29]));
    // …and the rest are spread, not bunched: some value lands in each third of the row.
    expect(kept.some((i) => i > 5 && i < 12)).toBe(true);
    expect(kept.some((i) => i >= 12 && i < 20)).toBe(true);
    expect(kept.length).toBeGreaterThan(3);
    expect(kept.length).toBeLessThan(30);
  });

  it('keeps every value when there is room for them all', () => {
    const spans = layOut(values.slice(0, 4), 340);
    expect(thinLabels(spans, spreadOrder(4)).size).toBe(4);
  });

  it('leaves out a value that would hang past its card, even one offered first', () => {
    const spans = [
      { left: -30, right: 10 },
      { left: 40, right: 60 },
      { left: 90, right: 130 },
    ];
    const kept = thinLabels(spans, spreadOrder(3, [0, 2]), 4, { left: -16, right: 120 });
    expect([...kept]).toEqual([1]);
  });

  it('offers every index exactly once, the called-out ones first', () => {
    const order = spreadOrder(9, [4, 0, 8, 4]);
    expect(order.slice(0, 3)).toEqual([4, 0, 8]);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('marks the values it cannot draw on the rendered chart, and keeps them readable', () => {
    // jsdom has no layout, so each value reports the box the real one would have.
    const spans = layOut(values, 340);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const col = this.closest('.bar-col');
      const i = col ? Array.from(col.parentElement!.querySelectorAll('.bar-col')).indexOf(col) : -1;
      // The card sits 16px of padding out from the plot on each side.
      const card = { left: -16, right: 356 };
      const s = this.classList.contains('bar-val') && i >= 0 ? spans[i] : card;
      return {
        left: s.left,
        right: s.right,
        width: s.right - s.left,
        top: 0,
        bottom: 12,
        height: 12,
        x: s.left,
        y: 0,
        toJSON() {},
      } as DOMRect;
    });
    const { container } = render(
      <BarChart
        title="Thirty bars"
        bars={values.map((_, i) => ({ label: 'Bar ' + i, value: 1000 + i * 137 }))}
      />,
    );
    const vals = Array.from(container.querySelectorAll<HTMLElement>('.bar-val'));
    const drawn = vals
      .map((v, i) => [v, i] as const)
      .filter(([v]) => !v.hasAttribute('data-quiet'));
    expect(drawn.length).toBeGreaterThan(3);
    expect(drawn.length).toBeLessThan(30);
    for (let a = 0; a < drawn.length; a++)
      for (let b = a + 1; b < drawn.length; b++)
        expect(overlaps(spans[drawn[a][1]], spans[drawn[b][1]])).toBe(false);
    // The tallest bar (the last) is the one the chart calls out, so its value is always drawn.
    expect(vals[29].hasAttribute('data-quiet')).toBe(false);
    // A value not drawn is still in the document for a screen reader, not deleted.
    expect(vals.every((v) => v.textContent)).toBe(true);
  });
});
