import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TrendChart } from '../src/canvas/TrendChart';
import { Scatter } from '../src/canvas/Scatter';
import { Standings } from '../src/canvas/Standings';

const svgText = (root: Element) =>
  Array.from(root.querySelectorAll('svg text')).map((t) => t.textContent ?? '');

describe('core charts can be read, not just looked at', () => {
  it('labels the trend chart value axis with round, unit-formatted levels', () => {
    const { container } = render(
      <TrendChart
        title="Revenue"
        unit="$"
        labels={['Jan', 'Feb', 'Mar']}
        series={[{ name: 'Revenue', color: 'var(--presence)', data: [1200, 5300, 7400] }]}
      />,
    );
    const text = svgText(container);
    expect(text).toContain('$0');
    expect(text.some((t) => /^\$\d+(\.\d+)?K$/.test(t))).toBe(true);
  });

  it('gives two trend charts on one board their own gradients', () => {
    const chart = (
      <TrendChart
        title="A"
        labels={['a', 'b']}
        series={[{ name: 's', color: 'var(--insight)', data: [1, 2] }]}
      />
    );
    const { container } = render(
      <>
        {chart}
        {chart}
      </>,
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    for (const area of container.querySelectorAll('.tc-area'))
      expect(ids.map((id) => `url(#${id})`)).toContain(area.getAttribute('fill'));
  });

  it('ticks both scatter axes on round numbers', () => {
    const { container } = render(
      <Scatter
        title="Spend vs. retention"
        points={[
          { x: 3, y: 41 },
          { x: 17, y: 58 },
          { x: 46, y: 83 },
        ]}
      />,
    );
    const nums = svgText(container)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    expect(nums).toContain(0);
    expect(nums.length).toBeGreaterThanOrEqual(6);
    for (const n of nums) expect(n % 10).toBe(0);
  });

  it('heads the standings columns so a record is not read as a score', () => {
    const { container, getByText } = render(
      <Standings
        rows={[
          { team: 'Celtics', rec: '54-18', gb: '—' },
          { team: 'Knicks', rec: '47-25', gb: '7' },
        ]}
      />,
    );
    const head = container.querySelector('.stand-head');
    expect(head?.textContent).toContain('Record');
    expect(getByText('GB').closest('abbr')?.getAttribute('title')).toBe('Games back');
    expect(container.querySelectorAll('.stand:not(.stand-head)')).toHaveLength(2);
  });
});
