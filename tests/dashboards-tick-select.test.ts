import { describe, expect, it } from 'vitest';
import { selectTickTargets } from '../src/live/dashboards/useDashboardLoop';
import type { Dashboard } from '../src/live/dashboards/types';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// Pure target selection for one automatic tick — the budget gate, the in-flight guard, and the
// AI-due de-dup against the data batch, all exercised without mounting the React effect/timers.

const dash = (over: Partial<Dashboard>): Dashboard =>
  ({
    id: 'd',
    title: 'D',
    metrics: [],
    widgets: [],
    tripwires: [],
    smartTrigger: false,
    cadence: { data: 'hourly', ai: 'on-change' },
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as Dashboard;

const liveMetric = {
  id: 'm',
  label: 'M',
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty' as const,
};

const ledgerEntries = (searches: number, at: number): LedgerEntry[] =>
  Array.from({ length: searches }, (_, i) => ({
    id: `e${i}`,
    at,
    kind: 'check' as const,
    text: '',
    dashboardIds: [],
    searches: 1 as const,
  }));

describe('selectTickTargets', () => {
  it('returns every due dashboard when the budget is nowhere near the cap', () => {
    const a = dash({ id: 'a', metrics: [liveMetric] });
    const b = dash({ id: 'b', metrics: [liveMetric] });
    const now = Date.now();
    const r = selectTickTargets([a, b], [], 40, now, new Set());
    expect(r.dueData.map((d) => d.id)).toEqual(['a', 'b']);
    expect(r.pausedAndBlocked).toBe(false);
  });

  it('excludes an in-flight dashboard from selection', () => {
    const a = dash({ id: 'a', metrics: [liveMetric] });
    const now = Date.now();
    const r = selectTickTargets([a], [], 40, now, new Set(['a']));
    expect(r.dueData).toEqual([]);
  });

  it('at the daily cap, a live-content dashboard is excluded and pausedAndBlocked is true', () => {
    const now = Date.now();
    const live = dash({ id: 'live', metrics: [liveMetric] });
    const r = selectTickTargets([live], ledgerEntries(40, now), 40, now, new Set());
    expect(r.dueData).toEqual([]);
    expect(r.pausedAndBlocked).toBe(true);
  });

  it('at the cap, a dashboard with only user-supplied content still gets its free clock wind', () => {
    const now = Date.now();
    const blankOnly = dash({
      id: 'blank',
      metrics: [{ ...liveMetric, query: '', blankKey: 'k' }], // user-supplied, not live
    });
    const r = selectTickTargets([blankOnly], ledgerEntries(40, now), 40, now, new Set());
    expect(r.dueData.map((d) => d.id)).toEqual(['blank']);
    expect(r.pausedAndBlocked).toBe(false); // nothing spendable was actually blocked
  });

  it('at the cap, a due scheduled AI verdict is also excluded (it is a billable grounded call)', () => {
    const now = Date.now();
    const aiDue = dash({
      id: 'ai',
      cadence: { data: 'manual', ai: 'daily' },
      nextDataAt: Number.MAX_SAFE_INTEGER,
      nextAiAt: 0,
    });
    const r = selectTickTargets([aiDue], ledgerEntries(40, now), 40, now, new Set());
    expect(r.dueAi).toBeNull();
    expect(r.pausedAndBlocked).toBe(true);
  });

  it('a dashboard covered by the data batch is not ALSO selected as the schedule-only AI target', () => {
    const now = Date.now();
    const both = dash({
      id: 'both',
      metrics: [liveMetric],
      cadence: { data: 'hourly', ai: 'daily' },
      nextDataAt: 0,
      nextAiAt: 0,
    });
    const r = selectTickTargets([both], [], 40, now, new Set());
    expect(r.dueData.map((d) => d.id)).toEqual(['both']);
    expect(r.dueAi).toBeNull(); // its AI gate is handled inline by the data-batch path instead
  });

  it('a distinct AI-due dashboard (not in the data batch) is still returned', () => {
    const now = Date.now();
    const dataOnly = dash({ id: 'data', metrics: [liveMetric] });
    const aiOnly = dash({
      id: 'ai',
      cadence: { data: 'manual', ai: 'daily' },
      nextDataAt: Number.MAX_SAFE_INTEGER,
      nextAiAt: 0,
    });
    const r = selectTickTargets([dataOnly, aiOnly], [], 40, now, new Set());
    expect(r.dueData.map((d) => d.id)).toEqual(['data']);
    expect(r.dueAi?.id).toBe('ai');
  });
});
