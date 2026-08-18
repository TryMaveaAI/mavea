// live-usage-ledger.test.ts — the per-turn token ledger: every billed provider call lands with
// the label of the call site that spent it, capped so a long session can't grow it forever.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordUsage,
  getUsageLedger,
  subscribeUsage,
  resetUsageLedgerForTest,
} from '../src/live/usage/ledger';

const usage = (input: number, output: number, cachedInput = 0) => ({
  input,
  output,
  cachedInput,
});

describe('usage ledger', () => {
  beforeEach(() => resetUsageLedgerForTest());

  it('records one entry per call, labelled by the call site that spent it', () => {
    recordUsage('canvas', usage(1200, 800), 1000);
    recordUsage('consistency-repair', usage(300, 150), 2000);
    const entries = getUsageLedger();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      at: 1000,
      label: 'canvas',
      input: 1200,
      cachedInput: 0,
      output: 800,
    });
    expect(entries[1].label).toBe('consistency-repair');
  });

  it('preserves cachedInput — the number that proves prompt caching is landing', () => {
    recordUsage('canvas', usage(5000, 900, 4200));
    expect(getUsageLedger()[0].cachedInput).toBe(4200);
  });

  it('silently ignores a provider that reports no usage (call sites need no guard)', () => {
    recordUsage('canvas', undefined);
    expect(getUsageLedger()).toHaveLength(0);
  });

  it('caps at 50 entries, evicting the oldest', () => {
    for (let i = 0; i < 55; i++) recordUsage('canvas', usage(i, i), i);
    const entries = getUsageLedger();
    expect(entries).toHaveLength(50);
    expect(entries[0].at).toBe(5); // the first five fell off
    expect(entries[49].at).toBe(54);
  });

  it('notifies subscribers on every write, and unsubscribe stops them', () => {
    let fired = 0;
    const unsubscribe = subscribeUsage(() => fired++);
    recordUsage('canvas', usage(10, 5));
    recordUsage('collapse-recovery', usage(20, 10));
    expect(fired).toBe(2);
    unsubscribe();
    unsubscribe(); // idempotent
    recordUsage('canvas', usage(30, 15));
    expect(fired).toBe(2);
  });

  it('keeps a stable snapshot reference between writes (useSyncExternalStore contract)', () => {
    recordUsage('canvas', usage(10, 5));
    const first = getUsageLedger();
    expect(getUsageLedger()).toBe(first);
    recordUsage('canvas', usage(20, 10));
    expect(getUsageLedger()).not.toBe(first);
  });

  it('coerces a malformed count to 0 instead of storing garbage', () => {
    recordUsage('canvas', usage(Number.NaN, -3, 100));
    expect(getUsageLedger()[0]).toMatchObject({ input: 0, output: 0, cachedInput: 100 });
  });
});
