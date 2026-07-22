import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendLedger,
  checksThisWeek,
  clearLedger,
  getLedger,
  searchesToday,
  setSuggestionState,
  weeklyRewind,
} from '../src/live/dashboards/ledger';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// The check ledger: the source of truth for "how many searches have we actually spent" (the
// budget derives from it, never a second counter) and the check-log rail / Weekly Rewind data.
// Tests: append/read-back ordering, retention + count caps, the pure day/week derivations
// (constructed directly against hand-built entries — not through the store — so they're immune to
// the store's own prune timing), and suggestion lifecycle.

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e',
  at: 0,
  kind: 'check',
  text: '',
  dashboardIds: [],
  searches: 1,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  clearLedger();
});

describe('ledger store', () => {
  it('appends and reads back newest-first', () => {
    appendLedger({ kind: 'check', text: 'first', dashboardIds: ['d1'], searches: 1, at: 1000 });
    appendLedger({ kind: 'check', text: 'second', dashboardIds: ['d1'], searches: 1, at: 2000 });
    const entries = getLedger();
    expect(entries.map((e) => e.text)).toEqual(['second', 'first']);
  });

  it('drops entries older than the retention window relative to the newest append', () => {
    appendLedger({ kind: 'check', text: 'old', dashboardIds: [], searches: 1, at: 0 });
    appendLedger({
      kind: 'check',
      text: 'recent',
      dashboardIds: [],
      searches: 1,
      at: RETENTION_MS + 1000,
    });
    expect(getLedger().map((e) => e.text)).toEqual(['recent']);
  });

  it('caps the entry count, keeping the most recent', () => {
    for (let i = 0; i < 420; i++) {
      appendLedger({ kind: 'check', text: `e${i}`, dashboardIds: [], searches: 0, at: i });
    }
    const entries = getLedger();
    expect(entries.length).toBeLessThanOrEqual(400);
    expect(entries[0].text).toBe('e419'); // newest-first
  });

  it('moves a suggestion to applied/dismissed without touching other entries', () => {
    const a = appendLedger({
      kind: 'savings',
      text: 'drop to daily',
      dashboardIds: ['d1'],
      searches: 0,
      suggestion: {
        action: 'set-cadence',
        dashboardId: 'd1',
        to: 'daily',
        savesPerMonth: 90,
        state: 'open',
      },
    });
    const b = appendLedger({ kind: 'check', text: 'unrelated', dashboardIds: [], searches: 1 });
    setSuggestionState(a.id, 'applied');
    const entries = getLedger();
    expect(entries.find((e) => e.id === a.id)?.suggestion?.state).toBe('applied');
    expect(entries.find((e) => e.id === b.id)?.kind).toBe('check');
  });

  it('malformed stored records are dropped, never thrown', () => {
    localStorage.setItem('mavea-dash-ledger-v1', JSON.stringify(['nope', { id: 'x' }, 42]));
    clearLedger(); // re-seeds an empty, valid store rather than trusting the garbage above
    expect(getLedger()).toEqual([]);
  });
});

describe('searchesToday', () => {
  it('counts only search-spending entries since local midnight', () => {
    const now = Date.now();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const entries = [
      entry({ at: midnight.getTime() - 1000, searches: 1 }),
      entry({ at: midnight.getTime() + 1000, searches: 1 }),
      entry({ at: midnight.getTime() + 2000, searches: 0, kind: 'insight' }),
    ];
    expect(searchesToday(entries, now)).toBe(1);
  });
});

describe('checksThisWeek', () => {
  it('counts only "check" entries for the given dashboard within 7 days', () => {
    const now = 20 * DAY;
    const entries = [
      entry({ at: now - 8 * DAY, dashboardIds: ['d1'] }), // too old
      entry({ at: now - 1 * DAY, dashboardIds: ['d1'] }),
      entry({ at: now, dashboardIds: ['d2'] }), // wrong dashboard
      entry({ at: now, dashboardIds: ['d1'], kind: 'insight', searches: 0 }), // wrong kind
    ];
    expect(checksThisWeek(entries, 'd1', now)).toBe(1);
  });
});

describe('weeklyRewind', () => {
  it('derives totals, a per-day breakdown, the top moment, and applied savings — all for free', () => {
    const now = 20 * DAY;
    const entries: LedgerEntry[] = [
      entry({ id: 'g', at: now - DAY, kind: 'goal', searches: 0, text: 'Goal!' }),
      entry({ id: 'c1', at: now - DAY, searches: 1 }),
      entry({ id: 'c2', at: now, searches: 1 }),
      entry({ id: 'c3', at: now - 10 * DAY, searches: 1 }), // outside the 7-day window
      entry({
        id: 's1',
        at: now,
        kind: 'savings',
        searches: 0,
        suggestion: {
          action: 'set-cadence',
          dashboardId: 'd1',
          to: 'daily',
          savesPerMonth: 90,
          state: 'applied',
        },
      }),
      entry({
        id: 's2',
        at: now,
        kind: 'savings',
        searches: 0,
        suggestion: {
          action: 'set-cadence',
          dashboardId: 'd2',
          to: 'hourly',
          savesPerMonth: 10,
          state: 'open',
        },
      }),
    ];
    const rewind = weeklyRewind(entries, now);
    expect(rewind.totalSearches).toBe(2); // c3 excluded, s1/s2 spend nothing
    expect(rewind.byDay).toHaveLength(7);
    expect(rewind.byDay.reduce((sum, d) => sum + d.searches, 0)).toBe(2);
    expect(rewind.topMoment?.id).toBe('g');
    expect(rewind.estSavedPerMonth).toBe(90); // only the APPLIED suggestion counts
  });

  it('falls back to the most-sourced entry when nothing is a goal', () => {
    const now = 5 * DAY;
    const entries: LedgerEntry[] = [
      entry({ id: 'a', at: now, sourceCount: 1 }),
      entry({ id: 'b', at: now, sourceCount: 3 }),
    ];
    expect(weeklyRewind(entries, now).topMoment?.id).toBe('b');
  });

  it('is null when nothing in the window qualifies', () => {
    expect(weeklyRewind([], 0).topMoment).toBeNull();
  });
});
