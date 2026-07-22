// useDashboards is a useSyncExternalStore hook over the dashboards store. It replaced a
// useState+useEffect pattern that could permanently miss the store's one-time async-hydrate
// event (dashboards are encrypted at rest, so the first read after a cold page load resolves
// later than the synchronous mount) — a component that missed that single event never got
// another chance and stayed stuck showing empty forever. useSyncExternalStore closes that gap by
// re-checking the snapshot at subscribe time, so this locks in the observable behavior that
// actually matters: the hook reflects a write that happens after it's mounted, every time.
import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { addDashboard, clearDashboards, updateMetricValue } from '../src/live/dashboards/store';
import { useDashboards } from '../src/live/dashboards/useDashboards';
import type { Dashboard } from '../src/live/dashboards/types';

const makeDash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    question: '',
    thesis: { text: 'x', saidAt: 0 },
    tripwires: [],
    metrics: [
      {
        id: 'm1',
        label: 'm1',
        query: 'q',
        sourceQuote: { text: 'because', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
    sources: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'on-change' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

beforeEach(() => {
  localStorage.clear();
  clearDashboards();
});

describe('useDashboards', () => {
  it('reflects the current store on mount', () => {
    addDashboard(makeDash());
    const { result } = renderHook(() => useDashboards());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('d1');
  });

  it('picks up a write that happens after mount, without a remount', () => {
    const { result } = renderHook(() => useDashboards());
    expect(result.current).toHaveLength(0);
    act(() => addDashboard(makeDash()));
    expect(result.current).toHaveLength(1);
  });

  it('re-renders on a metric update but keeps the same array identity when nothing changes between renders', () => {
    addDashboard(makeDash());
    const { result, rerender } = renderHook(() => useDashboards());
    const first = result.current;
    rerender();
    // No write happened — a torn/unstable snapshot would show a different reference here and
    // (in real React, outside this harness) trigger the "getSnapshot should be cached" warning.
    expect(result.current).toBe(first);
    act(() => updateMetricValue('d1', 'm1', 7, '7', 'search', 1000));
    expect(result.current[0].metrics[0].lastValue).toBe(7);
    expect(result.current).not.toBe(first);
  });
});
