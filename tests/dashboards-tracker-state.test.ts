// The tracker state machine: where a tracker stands, as one explicit value instead of a status the
// UI had to deduce from lastRefreshedAt + lastDataOutcome + nextDataAt + oneShotAt. The behaviour
// that matters most is what a FAILED first check does — it keeps the board and says what it is
// waiting on, where it used to delete the work outright.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  failureFromOutcome,
  failureLine,
  isPending,
  stateAfterFailure,
  stateAfterSuccess,
  trackerState,
} from '../src/live/dashboards/trackerState';
import {
  addDashboard,
  clearDashboards,
  getDashboard,
  invalidate,
  markTrackerFailure,
} from '../src/live/dashboards/store';
import type { Dashboard } from '../src/live/dashboards/types';

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'T',
    question: '',
    thesis: { text: '', saidAt: 0 },
    tripwires: [],
    metrics: [],
    sources: [],
    widgets: [],
    cadence: { data: 'manual', ai: 'manual' },
    alerts: { inApp: true, push: false },
    createdAt: 1,
    updatedAt: 1,
    nextDataAt: Number.MAX_SAFE_INTEGER,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

beforeEach(() => {
  localStorage.clear();
  clearDashboards();
});

describe('trackerState — derived for records written before the field existed', () => {
  it('a board that never refreshed is pending', () => {
    expect(trackerState(dash()).status).toBe('pending');
    expect(isPending(dash())).toBe(true);
  });

  it('a board that refreshed is active as of that moment', () => {
    const st = trackerState(dash({ lastRefreshedAt: 5000 }));
    expect(st).toEqual({ status: 'active', lastSuccessAt: 5000 });
  });

  it('a refreshed board whose last pass grounded nothing is degraded, not active', () => {
    const st = trackerState(dash({ lastRefreshedAt: 5000, lastDataOutcome: 'unverified' }));
    expect(st.status).toBe('degraded');
  });

  it('a stored state wins over the derivation', () => {
    const st = trackerState(
      dash({ lastRefreshedAt: null, state: { status: 'active', lastSuccessAt: 9 } }),
    );
    expect(st).toEqual({ status: 'active', lastSuccessAt: 9 });
  });
});

describe('state transitions', () => {
  it('a success always clears a prior failure', () => {
    expect(stateAfterSuccess(100)).toEqual({ status: 'active', lastSuccessAt: 100 });
  });

  it('a failure with no prior success stays pending and carries the reason', () => {
    const st = stateAfterFailure({ status: 'pending' }, { kind: 'rate-limit' }, 100);
    expect(st).toEqual({ status: 'pending', failure: { kind: 'rate-limit' }, lastAttemptAt: 100 });
  });

  it('a failure after a success degrades but REMEMBERS the success, so real data still shows', () => {
    const st = stateAfterFailure({ status: 'active', lastSuccessAt: 50 }, { kind: 'network' }, 100);
    expect(st).toEqual({
      status: 'degraded',
      lastSuccessAt: 50,
      failure: { kind: 'network' },
      lastAttemptAt: 100,
    });
  });

  it('every failure kind has its own line — no kind can ship without one', () => {
    for (const kind of [
      'auth',
      'rate-limit',
      'network',
      'no-model',
      'ungrounded',
      'provider-unavailable',
    ] as const) {
      expect(failureLine({ kind }).length).toBeGreaterThan(10);
    }
  });

  it('maps refresh outcomes to the failure that explains them', () => {
    expect(failureFromOutcome('no-model')).toEqual({ kind: 'no-model' });
    expect(failureFromOutcome('unverified')).toEqual({ kind: 'ungrounded' });
    expect(failureFromOutcome('failed')).toEqual({ kind: 'network' });
    expect(failureFromOutcome('done')).toBeNull();
    expect(failureFromOutcome('busy')).toBeNull(); // never ran; changes nothing
  });
});

describe('markTrackerFailure — persisted, and round-trips through the store', () => {
  it('records the reason without deleting anything', () => {
    addDashboard(dash({ metrics: [] }));
    markTrackerFailure('d1', { kind: 'rate-limit', retryAt: 42 }, 1000);
    const st = trackerState(getDashboard('d1')!);
    expect(st.status).toBe('pending');
    expect(st.status === 'pending' && st.failure).toEqual({ kind: 'rate-limit', retryAt: 42 });
    expect(getDashboard('d1')).not.toBeNull();
  });

  it('survives a reload through the coercer', () => {
    addDashboard(dash());
    markTrackerFailure('d1', { kind: 'auth' }, 1000);
    const raw = JSON.parse(JSON.stringify(getDashboard('d1'))) as unknown;
    // Round-trip exactly as a reload does: plaintext in storage, then a forced re-read.
    localStorage.setItem('mavea-dashboards-v1', JSON.stringify([raw]));
    invalidate();
    const st = trackerState(getDashboard('d1')!);
    expect(st.status === 'pending' && st.failure?.kind).toBe('auth');
  });

  it('drops a malformed stored state rather than inventing a status', () => {
    localStorage.setItem(
      'mavea-dashboards-v1',
      JSON.stringify([{ ...dash({ lastRefreshedAt: 7000 }), state: { status: 'nonsense' } }]),
    );
    invalidate();
    // Falls back to the legacy derivation instead of carrying garbage forward.
    expect(trackerState(getDashboard('d1')!)).toEqual({ status: 'active', lastSuccessAt: 7000 });
  });
});
