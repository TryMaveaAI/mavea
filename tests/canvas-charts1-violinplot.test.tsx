import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ViolinPlot } from '../src/canvas/blocks/charts1/ViolinPlot';
import type { ViolinGroup } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a bug found from a live screenshot: ViolinPlot's bottom group labels
// sat at a fixed font-size regardless of how many groups were plotted, so past ~4-5 groups the
// (unchanged) label width outpaced its narrowing slot and neighboring labels overlapped.

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

describe('ViolinPlot', () => {
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
