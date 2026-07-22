import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySuggestion,
  dismissSuggestion,
  hasRecentSuggestion,
  recordSuggestions,
  runOptimizer,
  suggestCadence,
  suggestionText,
} from '../src/live/dashboards/optimizer';
import { appendLedger, clearLedger, getLedger } from '../src/live/dashboards/ledger';
import { addDashboard, clearDashboards, getDashboard } from '../src/live/dashboards/store';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// The cadence optimizer: a zero-model-cost detector over real usage (ledger checks + tracked
// opens). Every savings figure must be an extrapolation from OBSERVED counts, never invented.

const liveMetric: MetricSpec = {
  id: 'm',
  label: 'M',
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: 1,
  origin: 'search',
};

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Apple',
    metrics: [liveMetric],
    widgets: [],
    tripwires: [],
    cadence: { data: 'hourly', ai: 'on-change' },
    smartTrigger: false,
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

describe('suggestCadence', () => {
  it('suggests one step slower when checked often but rarely opened', () => {
    const s = suggestCadence(dash({ cadence: { data: 'hourly', ai: 'on-change' } }), 20, 1);
    expect(s?.to).toBe('6h');
  });

  it('drops all the way to daily when the dashboard is never opened at all', () => {
    const s = suggestCadence(dash({ cadence: { data: 'hourly', ai: 'on-change' } }), 20, 0);
    expect(s?.to).toBe('daily');
  });

  it('steps 15min down to hourly', () => {
    const s = suggestCadence(dash({ cadence: { data: '15min', ai: 'on-change' } }), 20, 1);
    expect(s?.to).toBe('hourly');
  });

  it('never suggests below the check-count floor', () => {
    expect(suggestCadence(dash(), 5, 0)).toBeNull();
  });

  it('never suggests once opens exceed the threshold — the user IS using it', () => {
    expect(suggestCadence(dash(), 20, 3)).toBeNull();
  });

  it('never suggests for a dashboard with no live content — nothing spends anyway', () => {
    expect(suggestCadence(dash({ metrics: [], widgets: [] }), 20, 0)).toBeNull();
  });

  it('never suggests for a cadence that has no slower step (daily/manual)', () => {
    expect(suggestCadence(dash({ cadence: { data: 'daily', ai: 'on-change' } }), 20, 0)).toBeNull();
    expect(
      suggestCadence(dash({ cadence: { data: 'manual', ai: 'on-change' } }), 20, 0),
    ).toBeNull();
  });

  it('the projected savings is derived from the OBSERVED weekly count, not a flat rate', () => {
    const few = suggestCadence(dash(), 14, 0);
    const many = suggestCadence(dash(), 100, 0);
    expect(many!.savesPerMonth).toBeGreaterThan(few!.savesPerMonth);
  });
});

describe('hasRecentSuggestion / runOptimizer', () => {
  it('skips a dashboard that already has a suggestion within the cooldown window', () => {
    const now = 20 * 24 * 60 * 60 * 1000;
    const entries: LedgerEntry[] = [
      {
        id: 'e',
        at: now - 5 * 24 * 60 * 60 * 1000,
        kind: 'savings',
        text: '',
        dashboardIds: ['d1'],
        searches: 0,
        suggestion: {
          action: 'set-cadence',
          dashboardId: 'd1',
          to: 'daily',
          savesPerMonth: 10,
          state: 'open',
        },
      },
    ];
    expect(hasRecentSuggestion(entries, 'd1', now)).toBe(true);
    expect(hasRecentSuggestion(entries, 'd2', now)).toBe(false);
  });

  it('does not re-suggest a dashboard within cooldown, but does suggest a fresh one', () => {
    const now = Date.now();
    const cooled = dash({ id: 'cooled' });
    const fresh = dash({ id: 'fresh' });
    const entries: LedgerEntry[] = [
      {
        id: 'e',
        at: now,
        kind: 'savings',
        text: '',
        dashboardIds: ['cooled'],
        searches: 0,
        suggestion: {
          action: 'set-cadence',
          dashboardId: 'cooled',
          to: 'daily',
          savesPerMonth: 10,
          state: 'dismissed',
        },
      },
    ];
    const suggestions = runOptimizer(
      [cooled, fresh],
      entries,
      () => 20,
      () => 0,
      now,
    );
    expect(suggestions.map((s) => s.dashboardId)).toEqual(['fresh']);
  });

  it('caps the number of suggestions produced in one run', () => {
    const now = Date.now();
    const many = Array.from({ length: 10 }, (_, i) => dash({ id: `d${i}` }));
    const suggestions = runOptimizer(
      many,
      [],
      () => 20,
      () => 0,
      now,
      3,
    );
    expect(suggestions).toHaveLength(3);
  });
});

describe('suggestionText', () => {
  it('names the dashboard, current cadence, target cadence, and observed savings', () => {
    const d = dash({ title: 'Apple', cadence: { data: 'hourly', ai: 'on-change' } });
    const s = suggestCadence(d, 20, 1)!;
    const text = suggestionText(d, s);
    expect(text).toContain('Apple');
    expect(text).toContain('hourly');
    expect(text).toContain('6 hours');
    expect(text).toMatch(/save about \d+ searches a month/);
  });
});

describe('recordSuggestions / applySuggestion / dismissSuggestion (real store + ledger)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
    clearLedger();
  });

  it('records an open savings entry per suggestion, matched to its dashboard', () => {
    const d = dash();
    addDashboard(d);
    recordSuggestions(
      [d],
      [{ dashboardId: 'd1', to: 'daily', savesPerMonth: 42, checks7d: 20, opens7d: 0 }],
    );
    const entry = getLedger().find((e) => e.kind === 'savings');
    expect(entry?.suggestion).toMatchObject({
      action: 'set-cadence',
      dashboardId: 'd1',
      to: 'daily',
      savesPerMonth: 42,
      state: 'open',
    });
  });

  it('applySuggestion flips the cadence, marks the suggestion applied, and logs it', () => {
    addDashboard(dash());
    const opened = appendLedger({
      kind: 'savings',
      text: 'suggest',
      dashboardIds: ['d1'],
      searches: 0,
      suggestion: {
        action: 'set-cadence',
        dashboardId: 'd1',
        to: 'daily',
        savesPerMonth: 42,
        state: 'open',
      },
    });

    applySuggestion(opened.id, 'd1', 'daily');

    expect(getDashboard('d1')!.cadence.data).toBe('daily');
    const after = getLedger().find((e) => e.id === opened.id);
    expect(after?.suggestion?.state).toBe('applied');
    expect(getLedger().some((e) => e.kind === 'savings' && e.text.includes('Applied'))).toBe(true);
  });

  it('dismissSuggestion marks it dismissed without touching the dashboard', () => {
    addDashboard(dash());
    const opened = appendLedger({
      kind: 'savings',
      text: 'suggest',
      dashboardIds: ['d1'],
      searches: 0,
      suggestion: {
        action: 'set-cadence',
        dashboardId: 'd1',
        to: 'daily',
        savesPerMonth: 42,
        state: 'open',
      },
    });
    dismissSuggestion(opened.id);
    expect(getLedger().find((e) => e.id === opened.id)?.suggestion?.state).toBe('dismissed');
    expect(getDashboard('d1')!.cadence.data).toBe('hourly'); // unchanged
  });
});
