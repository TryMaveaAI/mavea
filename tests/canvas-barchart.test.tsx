import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BarChart } from '../src/canvas/BarChart';

// Regression coverage for a real bug: a chart-level `unit` ("fit score (1-10)") was glued to the
// value on EVERY bar, so the long descriptive phrase repeated across six narrow bars and the
// absolute, nowrap labels overlapped their neighbours. A descriptive unit now shows ONCE as an
// axis caption and each bar carries only its value; a tight glyph unit ($/%/×) still reads inline.

describe('BarChart value labels', () => {
  it('shows a descriptive unit once as a caption, not repeated on every bar', () => {
    const { container } = render(
      <BarChart
        title="Ranked fit"
        unit="fit score (1-10)"
        bars={[
          { label: 'Ginza', value: 10 },
          { label: 'Tsukiji', value: 9 },
          { label: 'Nihonbashi', value: 8 },
        ]}
      />,
    );
    expect(container.querySelector('.bars-unit')?.textContent).toBe('fit score (1-10)');
    const vals = [...container.querySelectorAll('.bar-val')].map((v) => v.textContent?.trim());
    expect(vals).toEqual(['10', '9', '8']);
    for (const v of vals) expect(v).not.toContain('fit score');
  });

  it('keeps a tight glyph unit inline on each bar, with no caption', () => {
    const { container } = render(
      <BarChart
        title="Share"
        unit="%"
        bars={[
          { label: 'A', value: 42 },
          { label: 'B', value: 58 },
        ]}
      />,
    );
    expect(container.querySelector('.bars-unit')).toBeNull();
    const vals = [...container.querySelectorAll('.bar-val')].map((v) => v.textContent?.trim());
    expect(vals).toEqual(['42%', '58%']);
  });

  it('renders an explicit per-bar label2 verbatim', () => {
    const { container } = render(
      <BarChart
        title="Revenue"
        unit="dollars raised"
        bars={[{ label: 'Seed', value: 1200000, label2: '$1.2M' }]}
      />,
    );
    expect(container.querySelector('.bar-val')?.textContent?.trim()).toBe('$1.2M');
  });
});
