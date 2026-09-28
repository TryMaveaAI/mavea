import { readFileSync } from 'node:fs';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KpiGrid } from '../src/canvas/KpiGrid';
import { InsightCard } from '../src/canvas/InsightCard';

afterEach(cleanup);

// A stat tile's type is fitted so its longest unbreakable run fits the tile whole: on a phone's
// three-up row the card's last-resort word-break used to split "112,000" and "ACTIVATION" mid-run.
// The CSS does the fitting from the run lengths KpiGrid states, so those are what is pinned here.
describe('KpiGrid states what its type has to hold', () => {
  const kpis = [
    { val: '112,000', label: 'Weekly Active Users' },
    { val: 'Pocket Wi-Fi', label: 'Activation Rate' },
  ];

  it('gives each tile the length of its longest figure and its longest label word', () => {
    const { container } = render(<KpiGrid title="Vital signs" kpis={kpis} />);
    const [a, b] = Array.from(container.querySelectorAll<HTMLElement>('.kpi'));
    expect(a.style.getPropertyValue('--kpi-val-chars')).toBe('7');
    expect(a.style.getPropertyValue('--kpi-label-chars')).toBe('6');
    expect(b.style.getPropertyValue('--kpi-val-chars')).toBe('6');
    expect(b.style.getPropertyValue('--kpi-label-chars')).toBe('10');
  });

  it('holds a single-run figure on one line, and lets a named value wrap between words', () => {
    const { container } = render(<KpiGrid title="Vital signs" kpis={kpis} />);
    const [a, b] = Array.from(container.querySelectorAll('.kpi-val'));
    expect(a.classList.contains('kpi-val--whole')).toBe(true);
    expect(b.classList.contains('kpi-val--whole')).toBe(false);
  });
});

// Type only shrinks to a floor, so a figure longer than a narrow tile can hold at that floor ran
// under the card's clipped edge. The grid is told the longest runs it holds and gives up a column
// rather than make a tile narrower than them; the insight's headline figure shrinks to its card.
describe('a figure never runs past its tile', () => {
  it('states the grid-wide longest figure and label word on the grid', () => {
    const { container } = render(
      <KpiGrid
        title="Three up"
        cols={3}
        kpis={[
          { val: '1,234,567,890.5', label: 'Internationalization' },
          { val: '36%', label: 'Share' },
        ]}
      />,
    );
    const grid = container.querySelector<HTMLElement>('.kpi-grid')!;
    expect(grid.style.getPropertyValue('--kpi-val-run')).toBe('15');
    expect(grid.style.getPropertyValue('--kpi-label-run')).toBe('20');
  });

  it('drops a column before a tile goes under those runs', () => {
    const css = readFileSync('src/styles/visualizations-harvested.css', 'utf8');
    const rule = /\n\.kpi-grid \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(rule).toMatch(/repeat\(\s*auto-fit/);
    expect(rule).toMatch(/--kpi-need:[^;]*--kpi-val-run[^;]*--kpi-label-run/);
  });

  it('sizes the insight headline figure to the run it has to hold', () => {
    const { container } = render(
      <InsightCard num="1" title="Run-rate" stat="$12,345,678,901.23" summary="" />,
    );
    const stat = container.querySelector<HTMLElement>('.insight-stat')!;
    expect(stat.style.getPropertyValue('--stat-run')).toBe('18');
    const css = readFileSync('src/styles/visualizations-extra.css', 'utf8');
    expect(css).toMatch(/\.insight-stat \.big \{[^}]*font-size: clamp\([^;]*--stat-run/);
  });
});
