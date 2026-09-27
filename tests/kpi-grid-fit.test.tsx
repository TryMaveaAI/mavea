import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KpiGrid } from '../src/canvas/KpiGrid';

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
