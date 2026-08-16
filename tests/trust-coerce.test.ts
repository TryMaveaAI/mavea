// trust-coerce.test.ts — the trust contract is the honesty gate for the world of values. A number
// exists only as a receipted resolution, a verified calculation, or an opted-in caveated
// illustration; everything else survives as structure with the number stripped. These tests pin
// every gate — fabrication, digit-splicing, empty corpus, self-consistency, cycles, laundering —
// plus the registry back-links and the digits-free phrase surface.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  asEdgeRelation,
  buildRegistry,
  coerceWorldValues,
  computeCalc,
  EDGE_RELATIONS,
  NOT_REPRESENTED_AS,
  relativeDeltaPhrase,
  selfConsistent,
  statusOf,
} from '../src/live/trust';
import type { WorldValue } from '../src/live/trust';
import {
  RAW_CALC_INCONSISTENT,
  RAW_CALC_OVER_ILLUSTRATIVE,
  RAW_CLEAN,
  RAW_CYCLIC,
  RAW_FABRICATED,
  RAW_HUGE,
  RAW_ILLUSTRATIVE,
  RAW_SPLICED,
  TRUST_CORPUS,
} from './lib/trustFixtures';

const coerce = (raw: unknown, corpus = TRUST_CORPUS, opts?: { illustrativeWorld?: boolean }) =>
  coerceWorldValues(raw, corpus, opts);

const get = (world: { values: Map<string, WorldValue> }, id: string): WorldValue => {
  const v = world.values.get(id);
  if (!v) throw new Error(`missing value ${id}`);
  return v;
};

describe('coerceWorldValues — grounding gates', () => {
  it('keeps a grounded T1 value with its receipt, scope, and derived status', () => {
    const churn = get(coerce(RAW_CLEAN), 'churn');
    expect(statusOf(churn)).toBe('grounded');
    if (churn.kind !== 'grounded') throw new Error('expected grounded');
    expect(churn.resolution.tier).toBe('T1');
    expect(churn.resolution.value).toBe(6.2);
    expect(churn.resolution.receipt.quote).toContain('6.2pp');
    expect(churn.scope?.unit).toBe('pp');
  });

  it('keeps a grounded T2 value on the web surface with its host', () => {
    const tickets = get(coerce(RAW_CLEAN), 'tickets');
    if (tickets.kind !== 'grounded') throw new Error('expected grounded');
    expect(tickets.resolution.tier).toBe('T2');
    expect(tickets.resolution.surface).toBe('web');
    expect(tickets.resolution.receipt.host).toBe('example.com');
  });

  it('demotes a fabricated T2 claim to structure with no number', () => {
    const fake = get(coerce(RAW_FABRICATED), 'made_up');
    expect(fake.kind).toBe('structure');
    if (fake.kind !== 'structure') throw new Error('expected structure');
    expect(fake.resolution.tier).toBe('T0');
    expect('value' in fake.resolution).toBe(false);
  });

  it('strips a digit-spliced value even when its quote is verbatim', () => {
    const spliced = get(coerce(RAW_SPLICED), 'spliced');
    expect(spliced.kind).toBe('structure');
  });

  it('grounds NOTHING against an empty corpus — all T1/T2 demoted', () => {
    const world = coerce(RAW_CLEAN, '');
    for (const v of world.values.values()) expect(v.kind).toBe('structure');
  });

  it('accepts a fenced JSON string payload', () => {
    const world = coerce('```json\n' + JSON.stringify({ values: RAW_CLEAN }) + '\n```');
    expect(get(world, 'churn').kind).toBe('grounded');
  });

  it('rejects malformed ids and keeps the first of a duplicated id', () => {
    const world = coerce([
      { id: 'bad id!', label: 'nope', tier: 'T1', value: 10, quote: 'The widget costs 10 dollars' },
      { id: 'dup', label: 'first', tier: 'T1', value: 10, quote: 'The widget costs 10 dollars' },
      { id: 'dup', label: 'second', tier: 'T1', value: 3, quote: 'we sell 3 units a day' },
    ]);
    expect(world.values.has('bad id!')).toBe(false);
    const dup = get(world, 'dup');
    if (dup.kind !== 'grounded') throw new Error('expected grounded');
    expect(dup.resolution.value).toBe(10);
    expect(world.dropped).toEqual(['bad id!', 'dup']);
  });

  it('caps one payload at the value budget and clamps labels', () => {
    const world = coerce(RAW_HUGE);
    expect(world.values.size).toBe(64);
    expect(world.dropped).toHaveLength(136);
    for (const v of world.values.values()) expect(v.label.length).toBeLessThanOrEqual(120);
  });
});

describe('coerceWorldValues — calculated values', () => {
  it('replaces a near-miss claimed value with the computed number (30.2 → 30)', () => {
    const rev = get(coerce(RAW_CLEAN), 'daily_revenue');
    expect(statusOf(rev)).toBe('calculated');
    if (rev.kind !== 'calculated') throw new Error('expected calculated');
    expect(rev.value).toBe(30);
    expect(rev.calc).toEqual({ formula: 'price * daily_units', inputs: ['price', 'daily_units'] });
  });

  it('settles a calc over another calc regardless of payload order', () => {
    const weekly = get(coerce(RAW_CLEAN), 'weekly_revenue');
    if (weekly.kind !== 'calculated') throw new Error('expected calculated');
    expect(weekly.value).toBe(210);
  });

  it('rejects a claim that contradicts its own arithmetic (10 × 3 claimed as 25)', () => {
    const rev = get(coerce(RAW_CALC_INCONSISTENT), 'rev');
    expect(rev.kind).toBe('structure');
  });

  it('downgrades a calc cycle to structure', () => {
    const world = coerce(RAW_CYCLIC);
    expect(get(world, 'a').kind).toBe('structure');
    expect(get(world, 'b').kind).toBe('structure');
  });

  it('never launders an illustrative input into a calculated number', () => {
    const world = coerce(RAW_CALC_OVER_ILLUSTRATIVE, TRUST_CORPUS, { illustrativeWorld: true });
    expect(get(world, 'guess').kind).toBe('illustrative');
    expect(get(world, 'double_guess').kind).toBe('structure');
  });
});

describe('coerceWorldValues — illustrative gate', () => {
  it('keeps a caveated T3 value only when the world opted in', () => {
    const opted = coerce(RAW_ILLUSTRATIVE, TRUST_CORPUS, { illustrativeWorld: true });
    const halfLife = get(opted, 'half_life');
    expect(halfLife.kind).toBe('illustrative');
    if (halfLife.kind !== 'illustrative') throw new Error('expected illustrative');
    expect(halfLife.resolution.value).toBe(5);
    expect(halfLife.resolution.illustrative).toContain('not your numbers');
  });

  it('demotes T3 without the flag, and without a caveat, to structure', () => {
    const noFlag = coerce(RAW_ILLUSTRATIVE);
    expect(get(noFlag, 'half_life').kind).toBe('structure');
    const opted = coerce(RAW_ILLUSTRATIVE, TRUST_CORPUS, { illustrativeWorld: true });
    expect(get(opted, 'bare_guess').kind).toBe('structure');
  });
});

describe('computeCalc', () => {
  const cleanValues = coerce(RAW_CLEAN).values;

  it('is exercised end-to-end via selfConsistent tolerances', () => {
    expect(selfConsistent(30, 30.2)).toBe(true);
    expect(selfConsistent(30, 25)).toBe(false);
  });

  it('rejects a constant formula and padded inputs — no laundering paths', () => {
    const resolve = (id: string) => cleanValues.get(id);
    expect(computeCalc({ formula: '42', inputs: ['price'] }, resolve)).toBeNull();
    expect(
      computeCalc({ formula: 'price * 2', inputs: ['price', 'daily_units'] }, resolve),
    ).toBeNull();
    expect(computeCalc({ formula: 'price * 2', inputs: [] }, resolve)).toBeNull();
  });

  it('detects a cycle among already-built calculated values', () => {
    const seed = cleanValues.get('daily_revenue');
    if (seed?.kind !== 'calculated') throw new Error('fixture must yield a calculated value');
    const cyclic = new Map<string, WorldValue>([
      [
        'a',
        {
          id: 'a',
          label: 'A',
          kind: 'calculated',
          value: seed.value,
          raw: seed.raw,
          calc: { formula: 'b + 1', inputs: ['b'] },
        },
      ],
      [
        'b',
        {
          id: 'b',
          label: 'B',
          kind: 'calculated',
          value: seed.value,
          raw: seed.raw,
          calc: { formula: 'a + 1', inputs: ['a'] },
        },
      ],
    ]);
    expect(computeCalc({ formula: 'a * 2', inputs: ['a'] }, (id) => cyclic.get(id))).toBeNull();
  });
});

describe('buildRegistry', () => {
  const values = coerce(RAW_CLEAN).values;
  const registry = buildRegistry(values, [
    { valueId: 'churn', surface: 'block', id: 'b1', label: 'March churn card' },
    { valueId: 'ghost', surface: 'node', id: 'n1', label: 'dangling' },
  ]);

  it('indexes registered refs and drops dangling valueIds', () => {
    expect(registry.usedIn.get('churn')).toEqual([
      { surface: 'block', id: 'b1', label: 'March churn card' },
    ]);
    expect(registry.usedIn.has('ghost')).toBe(false);
  });

  it('auto-adds calc back-links, including calc-over-calc', () => {
    expect(registry.usedIn.get('price')).toContainEqual({
      surface: 'calc',
      id: 'daily_revenue',
      label: 'input to Revenue per day',
    });
    expect(registry.usedIn.get('daily_revenue')).toContainEqual({
      surface: 'calc',
      id: 'weekly_revenue',
      label: 'input to Weekly revenue',
    });
  });

  it('returns a frozen snapshot', () => {
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.usedIn.get('churn'))).toBe(true);
  });
});

describe('asEdgeRelation', () => {
  it('round-trips every palette member and case-folds', () => {
    for (const relation of EDGE_RELATIONS) {
      expect(asEdgeRelation(relation)).toBe(relation);
      expect(asEdgeRelation(relation.toUpperCase())).toBe(relation);
    }
  });

  it('falls back to the weakest claim for invented neighbours', () => {
    expect(asEdgeRelation('influences')).toBe('contributes');
    expect(asEdgeRelation(undefined)).toBe('contributes');
    expect(asEdgeRelation(42)).toBe('contributes');
  });

  it('states a non-claim for every relation', () => {
    for (const relation of EDGE_RELATIONS) {
      expect(NOT_REPRESENTED_AS[relation].length).toBeGreaterThan(0);
    }
  });
});

describe('relativeDeltaPhrase', () => {
  it('phrases each magnitude band with direction', () => {
    expect(relativeDeltaPhrase(100, 150)).toBe('would rise meaningfully');
    expect(relativeDeltaPhrase(100, 67)).toBe('would fall meaningfully');
    expect(relativeDeltaPhrase(100, 112)).toBe('would rise somewhat');
    expect(relativeDeltaPhrase(100, 99)).toBe('would fall slightly');
    expect(relativeDeltaPhrase(100, 100.5)).toBe('would barely change');
    expect(relativeDeltaPhrase(0, 5)).toBe('would rise meaningfully');
  });

  it('degrades non-finite input to the weakest claim', () => {
    expect(relativeDeltaPhrase(NaN, 5)).toBe('would barely change');
    expect(relativeDeltaPhrase(5, Infinity)).toBe('would barely change');
  });

  it('NEVER emits a digit, across a numeric sweep', () => {
    const points = [-1e9, -1234.5, -42, -1, -0.004, 0, 0.004, 1, 42, 1234.5, 1e9];
    for (const base of points) {
      for (const cur of points) {
        expect(relativeDeltaPhrase(base, cur)).not.toMatch(/\d/);
      }
    }
  });
});

describe('source pin — the Computed brand has one producer', () => {
  it('only calc.ts asserts the brand, exactly once', () => {
    const dir = join('src', 'live', 'trust');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toContain('calc.ts');
    const branded = files.filter((f) => readFileSync(join(dir, f), 'utf8').includes('as Computed'));
    expect(branded).toEqual(['calc.ts']);
    const calcSource = readFileSync(join(dir, 'calc.ts'), 'utf8');
    expect(calcSource.split('as Computed').length - 1).toBe(1);
  });
});
