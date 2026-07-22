import { describe, expect, it } from 'vitest';
import { agoLine, dataStatusLine, metricDisplay } from '../src/live/dashboards/format';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';

// dataStatusLine is the honesty layer for the detail header's clock: it must never say "updated"
// unless a refresh genuinely found something, and must call out a dashboard with zero
// search-tracked metrics as structurally unable to ever update — rather than showing the same
// "updated just now" a real live-fetch would earn.

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'AAPL price',
  query: 'AAPL current price',
  sourceQuote: { text: 'track AAPL', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    metrics: [metric()],
    widgets: [],
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

describe('dataStatusLine', () => {
  it('calls out a dashboard with zero search-tracked metrics as structurally unable to update', () => {
    const d = dash({ metrics: [metric({ query: '', blankKey: 'm1' })] });
    expect(dataStatusLine(d, 1000)).toBe('no live metrics on this dashboard');
  });

  it('reads "not yet refreshed" when there is a live metric but no refresh has run', () => {
    const d = dash({ lastRefreshedAt: null });
    expect(dataStatusLine(d, 1000)).toBe('not yet refreshed');
  });

  it('says "updated" only when the last pass actually found something', () => {
    const d = dash({ lastRefreshedAt: 1000, lastDataOutcome: 'updated' });
    expect(dataStatusLine(d, 1000)).toBe('updated just now');
  });

  it('says "checked — no new data" for a real pass that came back empty, never "updated"', () => {
    const d = dash({ lastRefreshedAt: 1000, lastDataOutcome: 'no-change' });
    expect(dataStatusLine(d, 1000)).toBe('checked just now — no new data');
  });

  it('treats a legacy dashboard with no stored outcome as "updated" (pre-existing behavior)', () => {
    const d = dash({ lastRefreshedAt: 1000 });
    expect(dataStatusLine(d, 1000)).toBe('updated just now');
  });

  it('says "checked — couldn\'t verify with sources" for an unverified pass, never "no new data"', () => {
    const d = dash({ lastRefreshedAt: 1000, lastDataOutcome: 'unverified' });
    expect(dataStatusLine(d, 1000)).toBe("checked just now — couldn't verify with sources");
  });
});

describe('agoLine', () => {
  it('never fabricates a time — null reads as "not yet refreshed"', () => {
    expect(agoLine(null, 1000)).toBe('not yet refreshed');
  });
  it('formats a recent timestamp as "updated just now"', () => {
    expect(agoLine(1000, 1000)).toBe('updated just now');
  });
  it('a pass that found nothing new reads "checked", never "updated"', () => {
    expect(agoLine(1000, 1000, 'no-change')).toBe('checked just now');
    expect(agoLine(1000, 1000, 'updated')).toBe('updated just now');
  });
  it('an unverified pass also reads "checked" — an attempt genuinely ran', () => {
    expect(agoLine(1000, 1000, 'unverified')).toBe('checked just now');
  });
});

describe('metricDisplay', () => {
  it('falls back to "—" when there is no real value yet', () => {
    expect(metricDisplay(metric())).toBe('—');
  });
  it('prefers the raw token when present', () => {
    expect(metricDisplay(metric({ lastValue: 312.66, lastRaw: '$312.66' }))).toBe('$312.66');
  });
});

// The model is asked for the human token a source actually printed ("$1,624.95", "4.18%"), and when
// it gives one that is exactly what should be shown. But it sometimes hands back the bare float
// instead — and that went straight to the tile, which rendered a headline reading
// 0.68421052631578… : sixteen digits of a number nobody wanted at that precision, spilling out of
// its own card. Formatting a number is not changing it.
describe('metricDisplay — a raw token that is only a number is a number', () => {
  const metric = (over: Partial<MetricSpec>): MetricSpec =>
    ({
      id: 'm1',
      label: 'Arsenal win percentage',
      query: '',
      sourceQuote: { text: '', url: '' },
      lastValue: null,
      origin: 'search',
      ...over,
    }) as MetricSpec;

  it('cuts a long bare float down to something readable', () => {
    expect(metricDisplay(metric({ lastRaw: '0.6842105263157895' }))).toBe('0.6842');
  });

  it('leaves a real human token exactly as the source printed it', () => {
    expect(metricDisplay(metric({ lastRaw: '$1,624.95' }))).toBe('$1,624.95');
    expect(metricDisplay(metric({ lastRaw: '4.18%' }))).toBe('4.18%');
  });

  it('separates thousands and keeps the unit', () => {
    expect(metricDisplay(metric({ lastValue: 1624.9512, unit: '$' }))).toBe('1,625$');
  });

  it('still says "—" honestly when there is no value', () => {
    expect(metricDisplay(metric({ lastValue: null }))).toBe('—');
  });
});
