import { describe, expect, it } from 'vitest';
import { chipForEntry, formatLogTime } from '../src/live/dashboards/checkLogModel';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// The check-log rail's pure display helpers: the local-time formatter and the kind→chip mapping
// (including the 'check' kind's optional value-extraction nicety). Both are plain functions with
// no ledger/store dependency, so they're tested directly against hand-built entries.

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 'e',
  at: 0,
  kind: 'check',
  text: '',
  dashboardIds: [],
  searches: 1,
  ...over,
});

describe('formatLogTime', () => {
  it('formats a morning time with AM', () => {
    const at = new Date(2026, 0, 1, 9, 5).getTime();
    expect(formatLogTime(at)).toBe('9:05 AM');
  });

  it('formats an afternoon time with PM, minutes padded', () => {
    const at = new Date(2026, 0, 1, 16, 29).getTime();
    expect(formatLogTime(at)).toBe('4:29 PM');
  });

  it('formats noon as 12 PM and midnight as 12 AM', () => {
    const noon = new Date(2026, 0, 1, 12, 0).getTime();
    const midnight = new Date(2026, 0, 1, 0, 0).getTime();
    expect(formatLogTime(noon)).toBe('12:00 PM');
    expect(formatLogTime(midnight)).toBe('12:00 AM');
  });
});

describe('chipForEntry', () => {
  it('tags an insight entry', () => {
    expect(chipForEntry(entry({ kind: 'insight' }))).toEqual({
      label: '✦ INSIGHT',
      tone: 'presence',
    });
  });

  it('tags a savings entry', () => {
    expect(chipForEntry(entry({ kind: 'savings' }))).toEqual({
      label: '✦ SAVINGS',
      tone: 'insight',
    });
  });

  it('tags an alert and a goal entry with the danger tone', () => {
    expect(chipForEntry(entry({ kind: 'alert' }))?.tone).toBe('danger');
    expect(chipForEntry(entry({ kind: 'goal' }))?.tone).toBe('danger');
  });

  it('tags a briefing entry', () => {
    expect(chipForEntry(entry({ kind: 'briefing' }))).toEqual({
      label: 'BRIEFING',
      tone: 'presence',
    });
  });

  it('extracts a value chip from a single-dashboard check entry', () => {
    const e = entry({
      kind: 'check',
      dashboardIds: ['d1'],
      text: '10-Year Yield at 4.18%',
    });
    expect(chipForEntry(e)).toEqual({ label: '4.18%', tone: 'plain' });
  });

  it('omits the chip for a batched check entry spanning multiple dashboards', () => {
    const e = entry({
      kind: 'check',
      dashboardIds: ['d1', 'd2'],
      text: 'Dashboard One at $1,800 · Dashboard Two updated',
    });
    expect(chipForEntry(e)).toBeNull();
  });

  it('omits the chip when a check entry has nothing to lift out', () => {
    const e = entry({ kind: 'check', dashboardIds: ['d1'], text: 'Dashboard One checked' });
    expect(chipForEntry(e)).toBeNull();
  });
});
