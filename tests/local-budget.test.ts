// The shared localStorage ledger, on its own. Mavéa's stores each cap themselves sensibly, but
// the caps SUM past the ~5MB an origin actually gets, so whichever store writes last is the one
// the browser refuses — historically in silence, on data the user could still see. These pin the
// three properties that make the rescue safe: it sheds the LARGEST volunteer, it sheds only
// through the store's own eviction, and it never touches a key nobody volunteered.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetLocalBudgetForTests,
  measureMavea,
  registerStoreShedder,
  replaceStored,
  writeLocal,
} from '../src/lib/localBudget';
import { installQuotaStorage, type QuotaStorage } from './helpers/quotaStorage';

const LIMIT = 1_000;
let storage: QuotaStorage;

/** A stand-in store: one key holding `count` fixed-size records, shedding the OLDEST on demand. */
function fakeStore(key: string, count: number, recordUnits: number) {
  const shed = vi.fn(async () => {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const records = raw.split('|');
    if (records.length < 2) return 0;
    return replaceStored(key, records.slice(1).join('|'));
  });
  const records = Array.from({ length: count }, (_v, i) =>
    String(i).padEnd(recordUnits, String.fromCharCode(97 + i)),
  );
  localStorage.setItem(key, records.join('|'));
  registerStoreShedder(key, shed);
  return { shed };
}

beforeEach(() => {
  storage = installQuotaStorage(LIMIT);
  __resetLocalBudgetForTests();
});

afterEach(() => {
  storage.uninstall();
  vi.restoreAllMocks();
});

describe('measuring what Mavéa occupies', () => {
  it('counts only Mavéa-owned keys, largest first', () => {
    localStorage.setItem('mavea-live-library-v1', 'l'.repeat(200));
    localStorage.setItem('mavea.ripple.tracked.v1', 'r'.repeat(50));
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('some-other-app', 'x'.repeat(300));

    const usage = measureMavea();
    expect(usage.stores.map((s) => s.key)).toEqual([
      'mavea-live-library-v1',
      'mavea.ripple.tracked.v1',
    ]);
    // key + value units, and nothing from the two keys Mavéa doesn't own.
    expect(usage.total).toBe(
      'mavea-live-library-v1'.length + 200 + 'mavea.ripple.tracked.v1'.length + 50,
    );
  });
});

describe('a write the quota refuses', () => {
  it('sheds the LARGEST volunteered store, then lands', async () => {
    const big = fakeStore('mavea-big', 4, 100); // ~409 units
    const small = fakeStore('mavea-small', 4, 25); // ~114 units

    // 526 units are spent of 1000; the new value needs 569, and one shed of the big store (101
    // units) is exactly enough — so the small store must never be asked.
    const landed = await writeLocal('mavea-new', 'n'.repeat(560));

    expect(landed).toBe(true);
    expect(localStorage.getItem('mavea-new')).toHaveLength(560);
    expect(big.shed).toHaveBeenCalledTimes(1); // one shed was enough
    expect(small.shed).not.toHaveBeenCalled(); // the smaller store was never asked
  });

  it('sheds the store from ITS oldest end, keeping the newest records', async () => {
    fakeStore('mavea-big', 4, 100);
    const before = localStorage.getItem('mavea-big')!.split('|');

    await writeLocal('mavea-new', 'n'.repeat(600));

    const after = localStorage.getItem('mavea-big')!.split('|');
    expect(after).toEqual(before.slice(before.length - after.length));
    expect(after.length).toBeLessThan(before.length);
  });

  it('never evicts a key nobody volunteered — Mavéa-owned or not', async () => {
    fakeStore('mavea-big', 4, 100);
    localStorage.setItem('mavea-key-vault', 'k'.repeat(200)); // Mavéa's, but no shedder
    localStorage.setItem('theme', 'dark'); // not Mavéa's at all

    await writeLocal('mavea-new', 'n'.repeat(500));

    expect(localStorage.getItem('mavea-key-vault')).toHaveLength(200);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('is never its own victim — the value in hand predates the shed', async () => {
    const own = fakeStore('mavea-new', 4, 100);
    fakeStore('mavea-other', 1, 60);

    // Big enough that even reclaiming its own current value leaves it short, so the shed loop
    // really does run — and finds only a store with a single record, which sheds nothing.
    const landed = await writeLocal('mavea-new', 'n'.repeat(990));

    expect(landed).toBe(false); // nothing else left to give
    expect(own.shed).not.toHaveBeenCalled();
  });

  it('warns once per page, however many writes fail after it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('mavea-key-vault', 'k'.repeat(800));

    expect(await writeLocal('mavea-a', 'a'.repeat(400))).toBe(false);
    expect(await writeLocal('mavea-b', 'b'.repeat(400))).toBe(false);

    const lost = warn.mock.calls.filter((c) => String(c[0]).includes('was not saved'));
    expect(lost).toHaveLength(1);
    expect(String(lost[0][0])).toContain('mavea-a');
  });

  it('stays quiet when storage is walled off rather than full', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const err = new Error('denied');
      err.name = 'SecurityError';
      throw err;
    });

    expect(await writeLocal('mavea-a', 'a')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('replaceStored', () => {
  it('reports the units it actually freed', () => {
    localStorage.setItem('mavea-big', 'b'.repeat(400));
    expect(replaceStored('mavea-big', 'b'.repeat(100))).toBe(300);
    expect(localStorage.getItem('mavea-big')).toHaveLength(100);
  });
});
