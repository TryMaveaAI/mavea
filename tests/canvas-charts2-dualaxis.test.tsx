import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DualAxis } from '../src/canvas/blocks/charts2/DualAxis';

// Regression coverage for a real bug: category labels sat at a fixed horizontal offset with no
// wrap/clip, sized against the demo fixture's 4 short categories ("Wk1"..."Wk4"). As category
// count grew past that fixture (or a category name ran longer than "Wk1"), the shrinking band
// width packed each label's fixed-width text into its neighbor — illegible overlap instead of a
// readable axis.

const W = 320; // must track DualAxis.tsx's internal W — fixed-viewBox, not measured live.
const H = 210;

/** A label's own direct text (excludes a nested <title> tooltip's text). */
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

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

describe('DualAxis', () => {
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
