import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Candlestick } from '../src/canvas/blocks/charts2/Candlestick';
import type { Candle } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the axis row (.c2-cs-axis) is a `justify-content:
// space-between` flex row holding the first/last candle's period label with no width cap —
// sized only for the short demo-fixture strings ("Jan", "Dec"). A real-world date/period label
// far longer than the fixture wraps or pushes the opposite label past the card edge instead of
// truncating.

function candles(firstLabel: string, lastLabel: string): Candle[] {
  return [
    { label: firstLabel, o: 10, h: 12, l: 9, c: 11 },
    { label: 'mid', o: 11, h: 13, l: 10, c: 12 },
    { label: lastLabel, o: 12, h: 14, l: 11, c: 13 },
  ];
}

describe('Candlestick', () => {
  it('caps and ellipsizes long axis labels instead of overflowing the row', () => {
    const longFirst = 'Week ending March 3rd, 2024 (pre-market session)';
    const longLast = 'Week ending September 29th, 2025 (after-hours session)';
    const { container } = render(
      <Candlestick title="Price" candles={candles(longFirst, longLast)} />,
    );

    const labels = Array.from(container.querySelectorAll<HTMLElement>('.c2-cs-axis span'));
    expect(labels).toHaveLength(2);
    // Full text is preserved in the DOM (it's a CSS-only truncation, not a string clip)...
    expect(labels[0].textContent).toBe(longFirst);
    expect(labels[1].textContent).toBe(longLast);
    // ...but each label is set up to truncate rather than wrap or grow past its half of the
    // space-between row: hidden overflow + ellipsis + a width ceiling relative to the row.
    for (const label of labels) {
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.textOverflow).toBe('ellipsis');
      expect(label.style.whiteSpace).toBe('nowrap');
      expect(label.style.maxWidth).toBe('48%');
    }
  });

  it('still shows the short demo-fixture-sized labels untouched', () => {
    const { container } = render(<Candlestick title="Price" candles={candles('Jan', 'Dec')} />);
    const labels = Array.from(container.querySelectorAll<HTMLElement>('.c2-cs-axis span'));
    expect(labels.map((l) => l.textContent)).toEqual(['Jan', 'Dec']);
  });
});
