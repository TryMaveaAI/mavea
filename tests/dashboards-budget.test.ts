import { describe, expect, it } from 'vitest';
import {
  AMBER_RATIO,
  DEFAULT_DAILY_BUDGET,
  MAX_DAILY_BUDGET,
  MIN_DAILY_BUDGET,
  budgetState,
  getDashSettings,
  setDashSettings,
} from '../src/live/dashboards/budget';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// The daily search budget: pure accounting (budgetState) plus the small settings store it reads
// its cap from. `used`/`amber`/`paused` must be derivable from the ledger alone, with no separate
// counter to drift out of sync with what the check-log rail shows.

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e',
  at: 0,
  kind: 'check',
  text: '',
  dashboardIds: [],
  searches: 1,
  ...over,
});

describe('budgetState', () => {
  it('reads normal well under the cap', () => {
    const now = Date.now();
    const s = budgetState([entry({ at: now })], 40, now);
    expect(s.used).toBe(1);
    expect(s.amber).toBe(false);
    expect(s.paused).toBe(false);
  });

  it('goes amber at the configured ratio, not before', () => {
    const now = Date.now();
    const cap = 40;
    const justUnder = budgetState(
      Array.from({ length: Math.ceil(cap * AMBER_RATIO) - 1 }, () => entry({ at: now })),
      cap,
      now,
    );
    const atRatio = budgetState(
      Array.from({ length: Math.ceil(cap * AMBER_RATIO) }, () => entry({ at: now })),
      cap,
      now,
    );
    expect(justUnder.amber).toBe(false);
    expect(atRatio.amber).toBe(true);
  });

  it('pauses at the cap, and manual calls still count toward `used`', () => {
    const now = Date.now();
    const entries = Array.from({ length: 40 }, () => entry({ at: now, manual: true }));
    const s = budgetState(entries, 40, now);
    expect(s.used).toBe(40);
    expect(s.paused).toBe(true);
  });

  it('never sees searches from before local midnight', () => {
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const entries = [
      entry({ at: midnight.getTime() - 1000 }),
      entry({ at: midnight.getTime() + 1000 }),
    ];
    expect(budgetState(entries, 40, now).used).toBe(1);
  });

  it('resumesAt is the next local midnight, strictly after now', () => {
    const now = Date.now();
    const s = budgetState([], 40, now);
    const resumes = new Date(s.resumesAt);
    expect(resumes.getHours()).toBe(0);
    expect(resumes.getMinutes()).toBe(0);
    expect(s.resumesAt).toBeGreaterThan(now);
  });
});

describe('dash settings', () => {
  it('clamps the daily budget into range', () => {
    setDashSettings({ dailySearchBudget: 1 });
    expect(getDashSettings().dailySearchBudget).toBe(MIN_DAILY_BUDGET);
    setDashSettings({ dailySearchBudget: 10_000 });
    expect(getDashSettings().dailySearchBudget).toBe(MAX_DAILY_BUDGET);
    setDashSettings({ dailySearchBudget: 50 });
    expect(getDashSettings().dailySearchBudget).toBe(50);
  });

  it('leaves other settings untouched by a partial patch', () => {
    setDashSettings({ briefingEnabled: false });
    setDashSettings({ briefingSpoken: true });
    expect(getDashSettings().briefingEnabled).toBe(false);
    expect(getDashSettings().briefingSpoken).toBe(true);
  });
});

// The default is derived, not decorative: hourly ≈ up to ~24 searches/day while the app is open,
// so the out-of-box cap covers exactly one always-on hourly board with slack — anything past that
// is a deliberate spend the user raises the visible knob for. Pinned so a future "round it up to
// 50" edit has to argue with the cadence math first.
describe('the default budget', () => {
  it('covers one all-day hourly board, and no more than that by accident', () => {
    expect(DEFAULT_DAILY_BUDGET).toBeGreaterThanOrEqual(24);
    expect(DEFAULT_DAILY_BUDGET).toBeLessThan(2 * 24);
  });
});
