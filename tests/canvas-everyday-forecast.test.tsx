import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Forecast } from '../src/canvas/blocks/everyday/Forecast';
import type { ForecastDay } from '../src/canvas/blocks/everyday/types';

// Regression coverage for a real bug: .fc-condition had no overflow/wrap constraint, so a
// condition string longer than the short demo fixture ("Sunny", "Rain") — real forecasts say
// "Scattered thunderstorms" or "Wintry mix, heavy at times" — would wrap onto multiple lines
// and stretch that day's cell taller than its neighbors in the same grid row instead of
// staying a single truncated line.

function days(n: number, condition = 'Sunny'): ForecastDay[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Array.from({ length: n }, (_, i) => ({
    label: labels[i % labels.length] ?? `Day ${i + 1}`,
    condition,
    hi: `${70 + i}`,
    lo: `${50 + i}`,
  }));
}

describe('Forecast', () => {
  it('constrains .fc-condition to a single truncated line instead of wrapping/overflowing', () => {
    const longCondition = 'Scattered thunderstorms with wintry mix likely after midnight';
    const { container } = render(<Forecast title="Weather" days={days(5, longCondition)} />);
    const conditionEls = Array.from(container.querySelectorAll<HTMLElement>('.fc-condition'));
    expect(conditionEls).toHaveLength(5);
    for (const el of conditionEls) {
      // The full text is still preserved in the DOM (as text content + a title tooltip) —
      // only its rendered box is constrained to one line.
      expect(el.textContent).toBe(longCondition);
      expect(el.getAttribute('title')).toBe(longCondition);
      expect(el.style.whiteSpace).toBe('nowrap');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.overflow).toBe('hidden');
    }
  });

  it('keeps every day cell the same shape regardless of condition length, so a long string in one cell cannot stretch it past its neighbors', () => {
    const mixed: ForecastDay[] = [
      { label: 'Mon', condition: 'Sunny', hi: '72', lo: '58' },
      {
        label: 'Tue',
        condition: 'Scattered thunderstorms with wintry mix likely after midnight',
        hi: '68',
        lo: '54',
      },
      { label: 'Wed', condition: 'Cloudy', hi: '65', lo: '50' },
    ];
    const { container } = render(<Forecast title="Weather" days={mixed} />);
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.fc-condition'));
    expect(cells).toHaveLength(3);
    // Every cell — long or short condition alike — carries the identical single-line
    // truncation contract, so no cell can render taller than the others in the row.
    for (const el of cells) {
      expect(el.style.whiteSpace).toBe('nowrap');
      expect(el.style.overflow).toBe('hidden');
    }
  });

  it('leaves a short condition fully visible and untruncated', () => {
    const { container } = render(<Forecast title="Weather" days={days(3, 'Rain')} />);
    const el = container.querySelector<HTMLElement>('.fc-condition');
    expect(el?.textContent).toBe('Rain');
    expect(el?.getAttribute('title')).toBe('Rain');
  });
});
