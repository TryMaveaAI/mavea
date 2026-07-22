import { beforeEach, describe, expect, it } from 'vitest';
import {
  briefingNeededToday,
  buildBriefChips,
  buildBriefingContext,
  getBriefing,
  recordBriefing,
} from '../src/live/dashboards/briefing';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';

// The morning briefing: a once-per-day gate, CONTEXT lines for dashboards outside the batch, and
// chips built strictly from stored values (never the model's prose) — verified separately so a
// hallucinated narrative number can never surface as a chip.

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm',
  label: 'M',
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'D',
    metrics: [],
    widgets: [],
    ...over,
  }) as Dashboard;

beforeEach(() => {
  localStorage.clear();
});

describe('briefingNeededToday', () => {
  it('is true before any briefing has been recorded', () => {
    expect(briefingNeededToday(Date.now())).toBe(true);
  });

  it('is false the same day after recordBriefing, true again the next day', () => {
    const now = Date.parse('2026-07-10T09:00:00Z');
    recordBriefing('Good morning.', [], now);
    expect(briefingNeededToday(Date.parse('2026-07-10T18:00:00Z'))).toBe(false);
    expect(briefingNeededToday(Date.parse('2026-07-11T00:01:00Z'))).toBe(true);
  });
});

describe('buildBriefingContext', () => {
  it('includes a real headline for a dashboard outside the batch, skips ones inside it', () => {
    const inBatch = dash({
      id: 'a',
      title: 'Apple',
      metrics: [metric({ label: 'Price', lastValue: 313, lastRaw: '$313' })],
    });
    const outside = dash({
      id: 'b',
      title: 'Yankees',
      metrics: [metric({ label: 'Record', lastValue: 87, lastRaw: '87-60' })],
    });
    const context = buildBriefingContext([inBatch, outside], new Set(['a']));
    expect(context).toContain('Yankees');
    expect(context).toContain('87-60');
    expect(context).not.toContain('Apple');
  });

  it('skips a dashboard with no real value yet — an honest "—" is not worth mentioning', () => {
    const empty = dash({ id: 'a', title: 'Empty', metrics: [metric()] });
    expect(buildBriefingContext([empty], new Set())).toBe('');
  });
});

describe('buildBriefChips', () => {
  it('builds one chip per dashboard with a real headline value, from STORED state', () => {
    const a = dash({
      id: 'a',
      title: 'Apple',
      metrics: [metric({ label: 'Price', lastValue: 313.62, lastRaw: '$313.62' })],
    });
    const chips = buildBriefChips([a]);
    expect(chips).toEqual([{ dashboardId: 'a', label: 'Price', value: '$313.62' }]);
  });

  it('never invents a chip for a dashboard with nothing real yet', () => {
    const empty = dash({ id: 'a', metrics: [metric()] });
    expect(buildBriefChips([empty])).toEqual([]);
  });
});

describe('recordBriefing / getBriefing round-trip', () => {
  it('stores the text and chips, readable back immediately (in-memory cache)', () => {
    const now = Date.parse('2026-07-10T09:00:00Z');
    const a = dash({
      id: 'a',
      title: 'Apple',
      metrics: [metric({ label: 'Price', lastValue: 313, lastRaw: '$313' })],
    });
    recordBriefing('Apple stands at $313.', [a], now);
    const b = getBriefing();
    expect(b?.text).toBe('Apple stands at $313.');
    expect(b?.chips).toEqual([{ dashboardId: 'a', label: 'Price', value: '$313' }]);
    expect(b?.date).toBe('2026-07-10');
  });

  it('stores normal display copy separately from its native-oriented spoken twin', () => {
    const now = Date.parse('2026-07-10T09:00:00Z');
    recordBriefing('Your [[Omakase|oh-mah-kah-seh]] tracker is steady.', [], now);
    expect(getBriefing()).toMatchObject({
      text: 'Your Omakase tracker is steady.',
      spoken: 'Your oh-mah-kah-seh tracker is steady.',
    });
  });
});
