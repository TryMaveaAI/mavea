import { describe, expect, it } from 'vitest';
import { getOpens, opensSince, pruneDeadOpens, recordOpen } from '../src/live/dashboards/opens';
import { addDashboard, clearDashboards, removeDashboard } from '../src/live/dashboards/store';

// Open-tracking: how often the user actually visits a dashboard's detail page — the cadence
// optimizer's "you check this hourly but only opened it twice" signal. Each test uses its own
// unique dashboard ids so it's independent of the module's persistent in-memory cache / test order.

describe('opens', () => {
  it('records an open and counts it since a given time', () => {
    recordOpen('rec-a', 1000);
    expect(opensSince('rec-a', 0, 2000)).toBe(1);
  });

  it('only counts opens since the given time', () => {
    recordOpen('since-a', 1000);
    recordOpen('since-a', 5000);
    expect(opensSince('since-a', 3000, 6000)).toBe(1);
    expect(opensSince('since-a', 0, 6000)).toBe(2);
  });

  it('caps per-dashboard history', () => {
    for (let i = 0; i < 40; i++) recordOpen('cap-a', 1000 + i);
    expect(getOpens(50_000)['cap-a']).toHaveLength(30);
  });

  it('prunes a dead dashboard id without touching live ones', () => {
    recordOpen('live-a', 1000);
    recordOpen('dead-a', 1000);
    const keep = new Set(Object.keys(getOpens(50_000)).filter((id) => id !== 'dead-a'));
    pruneDeadOpens(keep);
    const all = getOpens(50_000);
    expect(all).toHaveProperty('live-a');
    expect(all).not.toHaveProperty('dead-a');
  });

  it('an id with no recorded opens is absent, not an empty array', () => {
    expect(getOpens(50_000)).not.toHaveProperty('never-opened-xyz');
    expect(opensSince('never-opened-xyz', 0, 50_000)).toBe(0);
  });
});

// pruneDeadOpens existed and asked, in its own doc, to be called alongside deletion — and nothing
// ever did. A deleted dashboard's visit history sat in the map for good, still feeding the cadence
// optimizer, which reasons about how often boards are actually looked at.
describe('opens are pruned when the dashboard goes', () => {
  const board = (id: string) =>
    ({
      id,
      title: id,
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
      nextDataAt: 0,
      nextAiAt: Number.MAX_SAFE_INTEGER,
      lastRefreshedAt: null,
    }) as never;

  it('deleting one dashboard drops its history and keeps the others', () => {
    addDashboard(board('del-a'));
    addDashboard(board('del-b'));
    recordOpen('del-a', 1000);
    recordOpen('del-b', 1000);

    removeDashboard('del-a');

    const all = getOpens(50_000);
    expect(all).not.toHaveProperty('del-a');
    expect(all).toHaveProperty('del-b');
  });

  it('clearing every dashboard clears the history with it', () => {
    addDashboard(board('clr-a'));
    recordOpen('clr-a', 1000);

    clearDashboards();

    expect(getOpens(50_000)).not.toHaveProperty('clr-a');
  });
});
