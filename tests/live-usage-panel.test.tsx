// The ledger existed but nothing showed it, so the one thing a BYOK reader can't see for
// themselves — what their key was billed for, and whether prompt caching is landing — stayed
// invisible. This pins the surface: totals, the cached share, and the per-call-site breakdown.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { UsagePanel } from '../src/live/usage/UsagePanel';
import { recordUsage, resetUsageLedgerForTest } from '../src/live/usage/ledger';

describe('UsagePanel', () => {
  beforeEach(() => resetUsageLedgerForTest());
  afterEach(cleanup);

  it('says nothing was spent rather than showing a row of zeroes', () => {
    const { container } = render(<UsagePanel />);
    expect(container.querySelector('.usage-empty')?.textContent).toContain('No model calls yet');
    expect(container.querySelector('.usage-totals')).toBeNull();
  });

  it('totals the session and states the cached share, which is the number that matters', () => {
    recordUsage('canvas', { input: 10_000, output: 900, cachedInput: 9_000 });
    recordUsage('evolve', { input: 2_000, output: 100, cachedInput: 1_000 });
    const { container } = render(<UsagePanel />);
    const values = [...container.querySelectorAll('.usage-totals dd')].map((d) => d.textContent);
    // 12,000 sent · 10,000 of it cached (83%) · 1,000 written · 2 calls.
    expect(values[0]).toContain('12,000');
    expect(values[1]).toContain('83');
    expect(values[2]).toContain('1,000');
    expect(values[3]).toBe('2');
  });

  it('attributes spend to the pass that spent it, heaviest first', () => {
    recordUsage('repair', { input: 500, output: 50, cachedInput: 0 });
    recordUsage('canvas', { input: 9_000, output: 800, cachedInput: 0 });
    const { container } = render(<UsagePanel />);
    const names = [...container.querySelectorAll('.usage-site-name')].map((n) => n.textContent);
    expect(names).toEqual(['canvas', 'repair']);
  });

  it('follows the ledger live — a call billed while the panel is open shows up', () => {
    const { container } = render(<UsagePanel />);
    act(() => recordUsage('canvas', { input: 100, output: 10, cachedInput: 0 }));
    expect(container.querySelector('.usage-empty')).toBeNull();
    expect(container.querySelector('.usage-totals')).not.toBeNull();
  });

  it('never states a currency figure — provider prices are not ours to guess', () => {
    recordUsage('canvas', { input: 10_000, output: 900, cachedInput: 0 });
    const { container } = render(<UsagePanel />);
    expect(container.textContent).not.toMatch(/[$£€]/);
  });
});
