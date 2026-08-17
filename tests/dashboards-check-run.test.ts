// The flight recorder. "Couldn't verify with sources" was the entire story available for a failed
// check — the same sentence whether the search never ran, ran and cited nothing, returned pages
// nothing could be extracted from, or extracted values the grounding gate then discarded. Those
// need four different responses from the user and were indistinguishable.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkRunsFor,
  clearCheckRuns,
  endCheckRun,
  recordStep,
  startCheckRun,
  subscribeCheckRuns,
} from '../src/live/dashboards/checkRun';

beforeEach(() => {
  clearCheckRuns();
});

describe('checkRun', () => {
  it('records the steps of a check in the order they happened', () => {
    const run = startCheckRun('d1', 1000);
    recordStep(run, 'search', true, { count: 1, at: 1100 });
    recordStep(run, 'sources', true, { count: 4, at: 1200 });
    endCheckRun(run, { outcome: 'updated', attempts: 1, at: 1300 });

    const [latest] = checkRunsFor('d1');
    expect(latest.steps.map((s) => s.name)).toEqual(['scheduled', 'search', 'sources']);
    expect(latest.outcome).toBe('updated');
    expect(latest.endedAt).toBe(1300);
  });

  it('distinguishes the failing step, with the reason attached to THAT step', () => {
    const run = startCheckRun('d1');
    recordStep(run, 'sources', false, {
      count: 0,
      detail: 'The model answered without citing a live source.',
    });
    endCheckRun(run, { outcome: 'unverified', failure: { kind: 'ungrounded' } });

    const [latest] = checkRunsFor('d1');
    const bad = latest.steps.filter((s) => !s.ok);
    expect(bad).toHaveLength(1);
    expect(bad[0].name).toBe('sources');
    expect(bad[0].detail).toContain('without citing');
    expect(latest.failure).toEqual({ kind: 'ungrounded' });
  });

  it('keeps runs per tracker, newest first, and never lets one tracker grow without bound', () => {
    for (let i = 0; i < 20; i++) endCheckRun(startCheckRun('d1', i), { outcome: 'no-change' });
    startCheckRun('d2');
    const runs = checkRunsFor('d1');
    expect(runs.length).toBeLessThanOrEqual(12);
    expect(runs[0].startedAt).toBe(19); // newest first
    expect(checkRunsFor('d2')).toHaveLength(1);
  });

  it('notifies subscribers as a run starts, advances, and ends — an open panel fills in live', () => {
    let hits = 0;
    const off = subscribeCheckRuns(() => {
      hits += 1;
    });
    const run = startCheckRun('d1');
    recordStep(run, 'search', true);
    endCheckRun(run, { outcome: 'updated' });
    off();
    expect(hits).toBe(3);
  });

  it('drops a tracker&apos;s runs when the tracker goes — a diagnostic cannot outlive its subject', () => {
    startCheckRun('d1');
    startCheckRun('d2');
    clearCheckRuns('d1');
    expect(checkRunsFor('d1')).toHaveLength(0);
    expect(checkRunsFor('d2')).toHaveLength(1);
  });

  it('is a no-op on a null run, so a caller never needs to branch', () => {
    expect(() => recordStep(null, 'search', true)).not.toThrow();
    expect(() => endCheckRun(null, { outcome: 'updated' })).not.toThrow();
  });
});
