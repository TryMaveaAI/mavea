import { describe, expect, it } from 'vitest';
import { buildTileModel, inferTileKind } from '../src/live/dashboards/tiles/tileModel';
import type { Dashboard, DataCadenceMode, MetricSpec, Widget } from '../src/live/dashboards/types';

// buildTileModel/inferTileKind are the honesty + precedence layer behind the home grid's
// subject-shaped tiles — get the ordering or the never-fabricate fallbacks wrong here and every
// tile downstream either misreads its subject or invents a number that was never fetched.

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'AAPL price',
  query: 'AAPL current price',
  sourceQuote: { text: 'track AAPL', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

function widget(type: string, props: unknown, over: Partial<Widget> = {}): Widget {
  return {
    id: `w-${type}`,
    span: 1,
    fromSource: 's1',
    block: { col: 1, type, props } as unknown as Widget['block'],
    ...over,
  };
}

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Apple',
    question: 'How is AAPL doing?',
    thesis: { text: 'x', saidAt: 0 },
    tripwires: [],
    metrics: [metric()],
    sources: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'daily' },
    smartTrigger: false,
    alerts: { inApp: false, push: false },
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: 0,
    lastRefreshedAt: null,
    ...over,
  }) as unknown as Dashboard;

const scoreboard = widget('scoreboard', {
  games: [
    { away: 'BOS', home: 'NYY', as: '4', hs: '2', status: 'Final', hot: true },
    { away: 'LAD', home: 'SF', as: '1', hs: '1', status: 'Top 7' },
  ],
});
const standings = widget('standings', {
  rows: [
    { team: 'Yankees', rec: '10-4', gb: '-' },
    { team: 'Red Sox', rec: '8-6', gb: '2' },
  ],
});
const forecast = widget('forecast', {
  title: 'Weather',
  days: [
    { label: 'Mon', hi: '72', lo: '54', condition: 'Sunny' },
    { label: 'Tue', hi: '68', lo: '50', condition: 'Cloudy' },
  ],
});

describe('inferTileKind precedence', () => {
  it('a one-shot date wins over everything else', () => {
    const d = dash({ oneShotAt: 5000, widgets: [scoreboard] });
    expect(inferTileKind(d, 0)).toBe('scheduled');
  });

  it('a DUE or PAST one-shot never wears the countdown face', () => {
    // The durable "first check" every fresh dashboard carries (store.ts's ensureFirstCheck) sets
    // oneShotAt to "now" — that's bookkeeping for a fetch still waiting on a model, not a real
    // countdown, so it must fall through to whatever this dashboard would otherwise read as.
    const dueNow = dash({ oneShotAt: 5000, widgets: [scoreboard] });
    expect(inferTileKind(dueNow, 5000)).toBe('sports');
    const past = dash({ oneShotAt: 5000, widgets: [scoreboard] });
    expect(inferTileKind(past, 9000)).toBe('sports');
  });

  it('a live window wins over a sports widget', () => {
    const d = dash({
      cadence: {
        data: '15min',
        ai: 'daily',
        window: { label: 'Kickoff', startAt: 0, endAt: 100, origin: 'user' },
      },
      widgets: [scoreboard],
    });
    expect(inferTileKind(d, 0)).toBe('live-event');
  });

  it('a scoreboard widget reads as sports, ahead of a forecast widget also present', () => {
    const d = dash({ widgets: [forecast, scoreboard] });
    expect(inferTileKind(d, 0)).toBe('sports');
  });

  it('a standings widget also reads as sports', () => {
    const d = dash({ widgets: [standings] });
    expect(inferTileKind(d, 0)).toBe('sports');
  });

  it('a forecast widget reads as weather, ahead of a probability-shaped metric', () => {
    const d = dash({
      metrics: [metric({ unit: '%', lastValue: 62 })],
      widgets: [forecast],
    });
    expect(inferTileKind(d, 0)).toBe('weather');
  });

  it('exactly one % metric with no scoreboard/standings widget reads as probability', () => {
    const d = dash({ metrics: [metric({ unit: '%', lastValue: 62 })] });
    expect(inferTileKind(d, 0)).toBe('probability');
  });

  it('a % metric alongside a scoreboard widget is sports, not probability', () => {
    const d = dash({ metrics: [metric({ unit: '%', lastValue: 62 })], widgets: [scoreboard] });
    expect(inferTileKind(d, 0)).toBe('sports');
  });

  it('a $ metric with >=2 history points reads as price', () => {
    const d = dash({
      metrics: [
        metric({
          unit: '$',
          lastValue: 190,
          history: [
            { at: 1, value: 185 },
            { at: 2, value: 190 },
          ],
        }),
      ],
    });
    expect(inferTileKind(d, 0)).toBe('price');
  });

  it('a metric labeled with "price" reads as price even with a non-$ unit', () => {
    const d = dash({
      metrics: [
        metric({
          label: 'Used car price',
          unit: 'mi',
          lastValue: 12000,
          history: [
            { at: 1, value: 13000 },
            { at: 2, value: 12000 },
          ],
        }),
      ],
    });
    expect(inferTileKind(d, 0)).toBe('price');
  });

  it('a $ metric with fewer than 2 history points does not read as price', () => {
    const d = dash({ metrics: [metric({ unit: '$', lastValue: 190 })] });
    expect(inferTileKind(d, 0)).toBe('generic');
  });

  it('none of the shapes match ⇒ generic', () => {
    const d = dash({ metrics: [metric({ unit: 'mi', lastValue: 42 })] });
    expect(inferTileKind(d, 0)).toBe('generic');
  });
});

describe('buildTileModel headline + fallback', () => {
  it('leads with the real headline metric when one has a value', () => {
    const d = dash({ metrics: [metric({ lastValue: 190, lastRaw: '$190.12' })] });
    const model = buildTileModel(d, 1000);
    expect(model.value).toBe('$190.12');
    expect(model.context).toBe('AAPL price');
  });

  it('a multi-widget dashboard with no metrics falls back to "N live cards", never a fabricated number', () => {
    const d = dash({
      metrics: [],
      widgets: [
        widget('thesis', { reasoning: 'x' }, { refreshQuery: 'reask this' }),
        widget('kpi', {}, { refreshQuery: 'reask that' }),
        widget('kpi', {}), // no refreshQuery — shouldn't count
      ],
    });
    const model = buildTileModel(d, 1000);
    expect(model.value).toBe('2');
    expect(model.context).toBe('live cards');
  });

  it('singular "live card" reads correctly for exactly one', () => {
    const d = dash({
      metrics: [],
      widgets: [widget('thesis', { reasoning: 'x' }, { refreshQuery: 'reask this' })],
    });
    const model = buildTileModel(d, 1000);
    expect(model.value).toBe('1');
    expect(model.context).toBe('live card');
  });

  it('nothing at all ⇒ an honest "—", never a placeholder number', () => {
    const d = dash({ metrics: [], widgets: [] });
    const model = buildTileModel(d, 1000);
    expect(model.value).toBe('—');
    expect(model.context).toBe('Not yet checked');
    expect(model.unverified).toBe(false);
  });

  it('an unverified pass with nothing to show reads "couldn\'t verify", not "not yet checked"', () => {
    const d = dash({ metrics: [], widgets: [], lastDataOutcome: 'unverified' });
    const model = buildTileModel(d, 1000);
    expect(model.context).toBe("Couldn't verify with sources — check again");
    expect(model.unverified).toBe(true);
  });

  it('a single unfetched metric still shows its label, honestly, as "—"', () => {
    const d = dash({ metrics: [metric({ lastValue: null })], widgets: [] });
    const model = buildTileModel(d, 1000);
    expect(model.value).toBe('—');
    expect(model.context).toBe('AAPL price');
  });
});

describe('buildTileModel delta', () => {
  it('an increase over the last two history points reads as an up badge', () => {
    const d = dash({
      metrics: [
        metric({
          unit: '$',
          lastValue: 190,
          history: [
            { at: 1, value: 185 },
            { at: 2, value: 190 },
          ],
        }),
      ],
    });
    expect(buildTileModel(d, 1000).delta).toEqual({ direction: 'up', text: '+$5' });
  });

  it('a decrease reads as a down badge', () => {
    const d = dash({
      metrics: [
        metric({
          unit: '%',
          lastValue: 40,
          history: [
            { at: 1, value: 45 },
            { at: 2, value: 40 },
          ],
        }),
      ],
    });
    expect(buildTileModel(d, 1000).delta).toEqual({ direction: 'down', text: '-5%' });
  });

  it('no badge when the last two points are unchanged', () => {
    const d = dash({
      metrics: [
        metric({
          lastValue: 10,
          history: [
            { at: 1, value: 10 },
            { at: 2, value: 10 },
          ],
        }),
      ],
    });
    expect(buildTileModel(d, 1000).delta).toBeNull();
  });

  it('no badge with fewer than 2 history points', () => {
    const d = dash({ metrics: [metric({ lastValue: 10, history: [{ at: 1, value: 10 }] })] });
    expect(buildTileModel(d, 1000).delta).toBeNull();
  });
});

describe('buildTileModel cadence + live window', () => {
  const modes: [DataCadenceMode, string][] = [
    ['15min', '15M'],
    ['hourly', '1H'],
    ['6h', '6H'],
    ['daily', 'DAILY'],
    ['manual', 'MANUAL'],
  ];
  it.each(modes)('renders the real stored cadence mode %s as %s', (data, label) => {
    const d = dash({ cadence: { data, ai: 'daily' } });
    expect(buildTileModel(d, 1000).cadenceLabel).toBe(label);
  });

  it('a manual cadence is not pause-eligible; anything else is', () => {
    expect(
      buildTileModel(dash({ cadence: { data: 'manual', ai: 'daily' } }), 1000).pauseEligible,
    ).toBe(false);
    expect(
      buildTileModel(dash({ cadence: { data: 'hourly', ai: 'daily' } }), 1000).pauseEligible,
    ).toBe(true);
  });

  it('isLiveWindow is true only strictly inside [startAt, endAt]', () => {
    const window = { label: 'Kickoff', startAt: 1000, endAt: 2000, origin: 'user' as const };
    const d = dash({ cadence: { data: '15min', ai: 'daily', window } });
    expect(buildTileModel(d, 999).isLiveWindow).toBe(false);
    expect(buildTileModel(d, 1000).isLiveWindow).toBe(true);
    expect(buildTileModel(d, 2000).isLiveWindow).toBe(true);
    expect(buildTileModel(d, 2001).isLiveWindow).toBe(false);
  });
});

describe('buildTileModel asOf', () => {
  it('strips the "updated"/"checked" verb prefix', () => {
    const d = dash({ lastRefreshedAt: 1000, lastDataOutcome: 'updated' });
    expect(buildTileModel(d, 1000).asOf).toBe('just now');
    expect(buildTileModel(d, 1000).everChecked).toBe(true);
  });

  it('a never-refreshed dashboard passes the honest fallback through unchanged', () => {
    const d = dash({ lastRefreshedAt: null });
    const model = buildTileModel(d, 1000);
    expect(model.asOf).toBe('not yet refreshed');
    expect(model.everChecked).toBe(false);
  });
});

// A fixture that has not been played has no score. The chip was interpolating the two missing values
// straight into its label and printing a literal "undefined-undefined" on the tile — a placeholder
// standing exactly where a real number belongs, which is the one thing this app must never do.
describe('form chips — an unplayed game has no score to show', () => {
  it('drops a game with no score instead of printing "undefined-undefined"', () => {
    const upcoming = widget('scoreboard', {
      games: [
        { away: 'BOS', home: 'NYY', as: '4', hs: '2', status: 'Final', hot: true },
        { away: 'ARS', home: 'CHE', status: '7:30 PM' }, // not played — no as/hs at all
      ],
    });
    const model = buildTileModel(dash({ widgets: [upcoming] }), 10_000);
    const labels = model.formChips.map((c) => c.label);
    expect(labels).toEqual(['4-2']);
    expect(labels.join(' ')).not.toContain('undefined');
  });

  it('drops a standings row with no record', () => {
    const partial = widget('standings', {
      rows: [
        { team: 'Yankees', rec: '10-4', gb: '-' },
        { team: 'Mets', gb: '3' }, // no record yet
      ],
    });
    const model = buildTileModel(dash({ widgets: [partial] }), 10_000);
    expect(model.formChips.map((c) => c.label)).toEqual(['10-4']);
  });
});
