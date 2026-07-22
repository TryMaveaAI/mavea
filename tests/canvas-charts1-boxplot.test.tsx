import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Boxplot } from '../src/canvas/blocks/charts1/Boxplot';
import type { BoxGroup } from '../src/canvas/blocks/charts1/types';

// Regression coverage for a bug found from a live screenshot: Boxplot's bottom group labels
// sat at a fixed font-size and relied on each slot narrowing as the group count grew, so past
// ~4 groups the (unchanged) label width outpaced its slot and neighboring labels overlapped.

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

describe('Boxplot', () => {
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
