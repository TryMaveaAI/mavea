import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, fireEvent } from '@testing-library/react';
import { AreaRange } from '../src/canvas/blocks/charts2/AreaRange';
import type { RangePoint } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the hover tooltip (.c2-ar-tip) had no width constraint and
// used white-space: nowrap, so a longer label (or points denser than the 7-day / 3-4 char demo
// fixture) rendered wider than the gap between neighboring points, colliding with them instead of
// truncating. The fix caps the tooltip's width and ellipsis-truncates the label.

function points(n: number, labelLen = 3): RangePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    label: 'Day '.repeat(1) + 'X'.repeat(labelLen) + i,
    value: 40 + i,
    lo: 30 + i,
    hi: 50 + i,
  }));
}

describe('AreaRange', () => {
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
