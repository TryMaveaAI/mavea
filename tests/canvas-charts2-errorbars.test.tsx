import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ErrorBars } from '../src/canvas/blocks/charts2/ErrorBars';
import type { ErrorGroup } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: category labels and the hover readout were positioned
// with no text-clipping constraint, sized against a small demo fixture. Once a group count (or
// a single label's length) grew past that fixture, labels collided into their neighbors and the
// hover tooltip — which followed the hot point's own x/y — could overlap an adjacent group.

const W = 480; // must track ErrorBars.tsx's internal W — fixed-viewBox, not measured live.
const H = 270;

/** A label's own direct text (excludes a nested <title> tooltip's text). */
function visibleText(node: Element): string {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('');
}

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

describe('ErrorBars', () => {
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
