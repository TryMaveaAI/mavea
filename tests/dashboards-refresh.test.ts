import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Comparator, Dashboard, MetricSpec, Tripwire } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import {
  dueAiDashboard,
  dueDataDashboard,
  evalDashboard,
  evalTripwireState,
  isBreached,
  refreshDashboard,
  shouldFireAi,
} from '../src/live/dashboards/refresh';

// The deterministic, free threshold engine. Tripwires fire on the TRANSITION into breach (so a
// still-breached level alert never re-bills), AWAITING never reads as a false CLEAR, and the AI
// gate spends only on a fresh break (smart) or a due schedule.

const metric = (id: string, lastValue: number | null, asOf = 5000): MetricSpec => ({
  id,
  label: id,
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue,
  origin: lastValue === null ? 'empty' : 'search',
  asOf,
});

const tw = (
  comparator: Comparator,
  threshold: number,
  state: Tripwire['state'] = 'WATCHING',
  metricId = 'm',
): Tripwire => ({
  id: 't',
  label: 't',
  metricId,
  comparator,
  threshold,
  sourceQuote: { text: 'reconsider if', saidAt: 0 },
  state,
});

const dash = (over: Partial<Dashboard>): Dashboard =>
  ({
    cadence: { data: 'hourly', ai: 'on-change' },
    smartTrigger: true,
    metrics: [],
    tripwires: [],
    widgets: [],
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as Dashboard;

describe('isBreached', () => {
  it('level comparators compare against the threshold', () => {
    expect(isBreached('gt', 4.6, null, 4.5)).toBe(true);
    expect(isBreached('gt', 4.4, null, 4.5)).toBe(false);
    expect(isBreached('lte', 4.5, null, 4.5)).toBe(true);
    expect(isBreached('lt', 5, null, 4.5)).toBe(false);
  });
  it('crosses_* fire only on the transition (needs prev on the far side)', () => {
    expect(isBreached('crosses_up', 4.6, 4.4, 4.5)).toBe(true); // crossed up this tick
    expect(isBreached('crosses_up', 4.6, 4.7, 4.5)).toBe(false); // already above last tick
    expect(isBreached('crosses_up', 4.6, null, 4.5)).toBe(false); // no prior value
    expect(isBreached('crosses_down', 4.4, 4.6, 4.5)).toBe(true);
  });
  it('pct_* fire on a percentage move from prev', () => {
    expect(isBreached('pct_drop', 90, 100, 5)).toBe(true); // -10% ≥ 5
    expect(isBreached('pct_drop', 98, 100, 5)).toBe(false); // -2% < 5
    expect(isBreached('pct_rise', 110, 100, 5)).toBe(true);
  });
});

describe('evalTripwireState', () => {
  it('null value ⇒ AWAITING (never a false CLEAR)', () => {
    expect(evalTripwireState(tw('gt', 4.5), null, null)).toBe('AWAITING');
  });
  it('breached ⇒ TRIGGERED', () => {
    expect(evalTripwireState(tw('gt', 4.5), 4.6, 4.4)).toBe('TRIGGERED');
  });
  it('near the threshold ⇒ WATCHING, comfortably far ⇒ CLEAR', () => {
    expect(evalTripwireState(tw('gt', 4.5), 4.3, 4.3)).toBe('WATCHING'); // within 10% below
    expect(evalTripwireState(tw('gt', 4.5), 2.0, 2.0)).toBe('CLEAR'); // far below
  });
  it('transition comparators read WATCHING until they fire', () => {
    expect(evalTripwireState(tw('crosses_up', 4.5), 2.0, 2.0)).toBe('WATCHING');
  });
});

describe('evalDashboard', () => {
  it('flags a fresh break as newlyTriggered and stamps brokenValue', () => {
    const d = dash({
      metrics: [metric('m', 4.6)],
      tripwires: [tw('gt', 4.5, 'WATCHING')],
    });
    const { tripwires, newlyTriggered } = evalDashboard(d, { m: 4.4 });
    expect(tripwires[0].state).toBe('TRIGGERED');
    expect(tripwires[0].brokenValue).toBe(4.6);
    expect(newlyTriggered).toHaveLength(1);
  });
  it('does NOT re-flag a tripwire that was already TRIGGERED (no re-bill while still over)', () => {
    const d = dash({
      metrics: [metric('m', 4.6)],
      tripwires: [tw('gt', 4.5, 'TRIGGERED')],
    });
    const { tripwires, newlyTriggered } = evalDashboard(d, { m: 4.6 });
    expect(tripwires[0].state).toBe('TRIGGERED');
    expect(newlyTriggered).toHaveLength(0);
  });
  it('a missing metric leaves its tripwire AWAITING', () => {
    const d = dash({ metrics: [], tripwires: [tw('gt', 4.5, 'WATCHING')] });
    expect(evalDashboard(d).tripwires[0].state).toBe('AWAITING');
  });
});

describe('due selectors', () => {
  it('dueDataDashboard returns the oldest-due, skipping not-yet-due', () => {
    const a = dash({ id: 'a', nextDataAt: 100 } as Partial<Dashboard>);
    const b = dash({ id: 'b', nextDataAt: 50 } as Partial<Dashboard>);
    const c = dash({ id: 'c', nextDataAt: 9999 } as Partial<Dashboard>);
    expect(dueDataDashboard([a, b, c], 200)?.id).toBe('b');
    expect(dueDataDashboard([c], 200)).toBeNull();
  });
  it('dueAiDashboard never returns a parked (manual/on-change) clock', () => {
    const parked = dash({ id: 'p', nextAiAt: Number.MAX_SAFE_INTEGER } as Partial<Dashboard>);
    expect(dueAiDashboard([parked], Date.now())).toBeNull();
  });
});

describe('shouldFireAi', () => {
  it('fires on a fresh break under smart trigger', () => {
    const d = dash({ smartTrigger: true });
    const r = shouldFireAi(d, [tw('gt', 4.5, 'TRIGGERED')], 1000);
    expect(r.fire).toBe(true);
    expect(r.trigger).not.toBe('scheduled');
  });
  it('does not fire on a break when smart trigger is off and no schedule is due', () => {
    const d = dash({ smartTrigger: false, cadence: { data: 'hourly', ai: 'on-change' } });
    expect(shouldFireAi(d, [tw('gt', 4.5, 'TRIGGERED')], 1000).fire).toBe(false);
  });
  it('fires on a due fixed schedule even with no break', () => {
    const d = dash({
      smartTrigger: false,
      cadence: { data: 'hourly', ai: 'daily' },
      nextAiAt: 500,
    });
    const r = shouldFireAi(d, [], 1000);
    expect(r.fire).toBe(true);
    expect(r.trigger).toBe('scheduled');
  });
  it('the common case — quiet poll — spends nothing', () => {
    const d = dash({ smartTrigger: true, cadence: { data: 'hourly', ai: 'on-change' } });
    expect(shouldFireAi(d, [], 1000).fire).toBe(false);
  });
});

describe('refreshDashboard — metric grounding (no widgets in play)', () => {
  const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
  const yieldDash = dash({
    metrics: [
      {
        id: 'm1',
        label: '10Y yield',
        query: 'q',
        sourceQuote: { text: 'x', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
  });

  beforeEach(() => {
    generateMock.mockReset();
  });

  it('trusts the values when the adapter reports native sources', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ values: { '10Y yield': 4.18 } }),
      sources: [{ title: 'Treasury', url: 'https://example.com/treasury' }],
    });
    const out = await refreshDashboard(yieldDash, cfg);
    expect(out.values.m1).toEqual({ value: 4.18, raw: '4.18' });
    expect(out.widgets).toEqual({});
  });

  it('trusts the values when only the self-reported inline "sources" array is present', async () => {
    // The documented Gemini gotcha this whole mechanism exists for: a real search ran, but the
    // adapter's own grounding metadata came back empty.
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        values: { '10Y yield': 4.18 },
        sources: [{ title: 'Treasury', url: 'https://example.com/treasury' }],
      }),
    });
    const out = await refreshDashboard(yieldDash, cfg);
    expect(out.values.m1).toEqual({ value: 4.18, raw: '4.18' });
  });

  it('discards the entire values map when neither source signal is present', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ values: { '10Y yield': 4.18 } }) });
    const out = await refreshDashboard(yieldDash, cfg);
    expect(out.values).toEqual({});
  });

  it('makes ONE call for a dashboard with only metrics — no widgets requested', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ values: { '10Y yield': 4.18 } }),
      sources: [{ title: 'Treasury', url: 'https://example.com/treasury' }],
    });
    await refreshDashboard(yieldDash, cfg);
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});
