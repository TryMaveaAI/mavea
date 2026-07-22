// The stat grid balances itself to its data: no orphan stat under a 2×2 hole (the "Target
// Metrics" card rendered 2+1 with a void), and an explicit author count still wins.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KpiGrid } from '../src/canvas/KpiGrid';

const k = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ val: `${i + 1}`, label: `L${i + 1}` }));

function colsOf(container: HTMLElement): string {
  const grid = container.querySelector<HTMLElement>('.kpi-grid')!;
  return grid.style.getPropertyValue('--kpi-cols');
}

describe('KpiGrid — balanced columns', () => {
  it('lays three stats as one row of three, four as a clean 2×2', () => {
    expect(colsOf(render(<KpiGrid title="t" kpis={k(3)} />).container)).toBe('3');
    expect(colsOf(render(<KpiGrid title="t" kpis={k(4)} />).container)).toBe('2');
    expect(colsOf(render(<KpiGrid title="t" kpis={k(2)} />).container)).toBe('2');
    expect(colsOf(render(<KpiGrid title="t" kpis={k(6)} />).container)).toBe('3');
  });

  it('an explicit author count always wins', () => {
    expect(colsOf(render(<KpiGrid title="t" kpis={k(3)} cols={2} />).container)).toBe('2');
  });

  it('the card carries the flex-column class that centers stats in a stretched cell', () => {
    const { container } = render(<KpiGrid title="t" kpis={k(3)} />);
    expect(container.querySelector('.card.kpi-card')).toBeTruthy();
  });
});
