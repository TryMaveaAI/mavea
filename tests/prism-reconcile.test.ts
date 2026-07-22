import { describe, expect, it } from 'vitest';
import { extractNumbers } from '../src/live/prism/reconcile/extractNumbers';
import { equalityVerdict, growthVerdict } from '../src/live/prism/reconcile/check';
import type { NumberAtom } from '../src/live/prism/reconcile/types';

// extractNumbers pulls figures out of grounded quotes in pure code; the verdicts decide a contradiction
// in pure code (the model never does the arithmetic). These pin the parsing + the calculator-checkable
// math — the part that must never be wrong in front of an expert.

function atom(over: Partial<NumberAtom>): NumberAtom {
  return {
    id: 'a',
    claimId: 'c',
    page: 1,
    raw: '1',
    value: 1,
    unit: 'count',
    label: '',
    quote: 'q',
    ...over,
  };
}

describe('extractNumbers', () => {
  it('reads currency, magnitude scale, and percent verbatim from one quote', () => {
    const atoms = extractNumbers([
      { id: 'c1', page: 4, quote: 'Revenue rose from $10M to $13M, a 40% increase.' },
    ]);
    const byRaw = new Map(atoms.map((a) => [a.raw, a]));
    expect(byRaw.get('$10M')).toMatchObject({
      value: 10_000_000,
      unit: 'currency',
      page: 4,
      claimId: 'c1',
    });
    expect(byRaw.get('$13M')).toMatchObject({ value: 13_000_000, unit: 'currency' });
    expect(byRaw.get('40%')).toMatchObject({ value: 40, unit: '%' });
    expect(atoms).toHaveLength(3);
  });

  it('handles decimals, billions, and multipliers', () => {
    const atoms = extractNumbers([
      { id: 'c', page: 1, quote: 'It grew 3× to $1.2B from 5 million users.' },
    ]);
    const byRaw = new Map(atoms.map((a) => [a.raw, a]));
    expect(byRaw.get('3×')).toMatchObject({ value: 3, unit: 'x' });
    expect(byRaw.get('$1.2B')).toMatchObject({ value: 1_200_000_000, unit: 'currency' });
    expect(byRaw.get('5 million')).toMatchObject({ value: 5_000_000, unit: 'count' });
  });

  it('does not double-count the number inside a currency figure', () => {
    const atoms = extractNumbers([{ id: 'c', page: 1, quote: 'costs of $10M' }]);
    expect(atoms).toHaveLength(1);
    expect(atoms[0]).toMatchObject({ raw: '$10M', unit: 'currency' });
  });
});

describe('equalityVerdict', () => {
  it('flags two percentages stated as the same quantity but differing', () => {
    const v = equalityVerdict(
      atom({ raw: '40%', value: 40, unit: '%', page: 2 }),
      atom({ raw: '30%', value: 30, unit: '%', page: 4 }),
      'growth',
    );
    expect(v).not.toBeNull();
    expect(v?.detail).toBe('p.2: 40%  ✕  p.4: 30%');
  });

  it('stays silent on a rounding-level difference', () => {
    expect(
      equalityVerdict(atom({ value: 40, unit: '%' }), atom({ value: 40.2, unit: '%' }), 'x'),
    ).toBeNull();
  });

  it('refuses to compare different units', () => {
    expect(
      equalityVerdict(atom({ value: 40, unit: '%' }), atom({ value: 40, unit: 'currency' }), 'x'),
    ).toBeNull();
  });

  it('uses a relative tolerance for currency', () => {
    expect(
      equalityVerdict(
        atom({ value: 10_000, unit: 'currency' }),
        atom({ value: 10_100, unit: 'currency' }),
        'x',
      ),
    ).toBeNull(); // within 2%
    expect(
      equalityVerdict(
        atom({ value: 10_000, unit: 'currency' }),
        atom({ value: 12_000, unit: 'currency' }),
        'x',
      ),
    ).not.toBeNull();
  });
});

describe('growthVerdict', () => {
  const pct = (v: number) => atom({ raw: `${v}%`, value: v, unit: '%', page: 4 });
  const money = (v: number, raw: string) => atom({ raw, value: v, unit: 'currency', page: 4 });

  it('catches a stated growth that the values do not support', () => {
    const v = growthVerdict(
      pct(40),
      money(10_000_000, '$10M'),
      money(13_000_000, '$13M'),
      'revenue',
    );
    expect(v).not.toBeNull();
    expect(v?.computed).toBe('30%');
    expect(v?.detail).toContain('$10M→$13M = 30%');
  });

  it('stays silent when the stated growth matches', () => {
    expect(
      growthVerdict(pct(30), money(10_000_000, '$10M'), money(13_000_000, '$13M'), 'r'),
    ).toBeNull();
  });

  it('refuses a zero base or mixed units', () => {
    expect(growthVerdict(pct(40), money(0, '$0'), money(13_000_000, '$13M'), 'r')).toBeNull();
    expect(
      growthVerdict(pct(40), atom({ value: 10, unit: 'count' }), money(13, '$13'), 'r'),
    ).toBeNull();
  });
});
