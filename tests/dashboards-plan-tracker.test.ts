// planTracker — the one create-time planning call behind "track anything". These lock the
// coercion honesty: only known display shapes survive, caps hold, and failure NEVER blocks
// creation (it degrades to a plain list tracker re-asking the user's own words).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import {
  answerOnce,
  coercePlan,
  fallbackPlan,
  planTracker,
} from '../src/live/dashboards/planTracker';

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' };

beforeEach(() => {
  generateMock.mockReset();
});

describe('coercePlan', () => {
  it('keeps well-formed metrics and widgets, normalizing type case and assigning spans', () => {
    const plan = coercePlan(
      {
        title: 'Yankees',
        metrics: [{ label: 'Win percentage', query: 'current Yankees win percentage', unit: '%' }],
        widgets: [
          { type: 'Scoreboard', query: 'latest Yankees results' },
          { type: 'standings', query: 'AL East standings' },
        ],
        cadence: '15min',
      },
      'yankees scores',
    );
    expect(plan).not.toBeNull();
    expect(plan!.metrics).toHaveLength(1);
    expect(plan!.widgets.map((w) => w.blockType)).toEqual(['scoreboard', 'standings']);
    expect(plan!.widgets.map((w) => w.span)).toEqual([2, 1]); // wide vs single mapping
    expect(plan!.cadence).toBe('15min');
  });

  it('drops unknown block types and empty queries; falls back to manual on a bad cadence', () => {
    const plan = coercePlan(
      {
        title: 'X',
        widgets: [
          { type: 'weathernow', query: 'not allowed — no honest empty state' },
          { type: 'list', query: '   ' },
          { type: 'list', query: 'real updates' },
        ],
        cadence: '5min',
      },
      'x',
    );
    expect(plan!.widgets).toHaveLength(1);
    expect(plan!.widgets[0].blockType).toBe('list');
    // A garbage/unrecognized model cadence falls back to manual, not a silent standing hourly
    // search spend — the same "never auto-search until asked" default every creation path uses.
    expect(plan!.cadence).toBe('manual');
  });

  it('caps metrics at 2 and widgets at 3', () => {
    const many = (n: number, mk: (i: number) => object): object[] =>
      Array.from({ length: n }, (_, i) => mk(i));
    const plan = coercePlan(
      {
        title: 'X',
        metrics: many(5, (i) => ({ label: `m${i}`, query: `q${i}` })),
        widgets: many(6, (i) => ({ type: 'list', query: `w${i}` })),
        cadence: 'daily',
      },
      'x',
    );
    expect(plan!.metrics).toHaveLength(2);
    expect(plan!.widgets).toHaveLength(3);
  });

  it('returns null when nothing usable survives', () => {
    expect(coercePlan({ title: 'X', widgets: [{ type: 'nope', query: 'q' }] }, 'x')).toBeNull();
    expect(coercePlan('not even an object', 'x')).toBeNull();
  });
});

describe('planTracker', () => {
  it('returns the coerced model plan on success', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        title: 'Denver weather',
        metrics: [{ label: 'Temperature in Denver', query: 'current temperature in Denver' }],
        widgets: [{ type: 'forecast', query: '5-day Denver forecast' }],
        cadence: 'hourly',
      }),
    });
    const plan = await planTracker('weather in denver', cfg);
    expect(plan.title).toBe('Denver weather');
    expect(plan.widgets[0].blockType).toBe('forecast');
  });

  it('falls back to a plain list tracker when the call throws — creation is never blocked', async () => {
    generateMock.mockRejectedValue(new Error('429'));
    const plan = await planTracker('yankees scores', cfg);
    expect(plan).toEqual(fallbackPlan('yankees scores'));
    expect(plan.widgets[0]).toMatchObject({ blockType: 'list', query: 'yankees scores' });
  });

  it('falls back when the model returns nothing coercible', async () => {
    generateMock.mockResolvedValue({ raw: 'sorry, no JSON here' });
    const plan = await planTracker('anything', cfg);
    expect(plan).toEqual(fallbackPlan('anything'));
  });
});

describe('coercePlan — static-fact catch', () => {
  it('accepts a static plan with NO metrics/widgets, backfilling a plain fallback widget', () => {
    const plan = coercePlan(
      {
        title: 'Everest height',
        kind: 'static',
        staticReason: 'a fixed physical fact',
        cadence: 'daily',
      },
      'height of everest',
    );
    expect(plan).not.toBeNull();
    expect(plan!.kind).toBe('static');
    expect(plan!.staticReason).toBe('a fixed physical fact');
    expect(plan!.widgets).toEqual([{ blockType: 'list', query: 'height of everest', span: 2 }]);
  });

  it('defaults to "live" when kind is absent or unrecognized', () => {
    const plan = coercePlan(
      { title: 'X', widgets: [{ type: 'list', query: 'q' }], cadence: 'hourly' },
      'x',
    );
    expect(plan!.kind).toBe('live');
  });

  it('still rejects an empty LIVE plan (kind absent counts as live)', () => {
    expect(coercePlan({ title: 'X', cadence: 'hourly' }, 'x')).toBeNull();
  });
});

describe('coercePlan — cadence windows + one-shot checks (never invented)', () => {
  const now = Date.parse('2026-07-10T12:00:00Z');

  it('accepts a window/one-shot with plausible, near-future ISO times', () => {
    const plan = coercePlan(
      {
        title: 'World Cup semifinal',
        widgets: [{ type: 'scoreboard', query: 'live semifinal score' }],
        cadence: '15min',
        window: {
          start: '2026-07-10T19:00:00Z',
          end: '2026-07-10T21:30:00Z',
          label: 'match only',
        },
      },
      'world cup semifinal',
      now,
    );
    expect(plan!.window).toEqual({
      startAt: Date.parse('2026-07-10T19:00:00Z'),
      endAt: Date.parse('2026-07-10T21:30:00Z'),
      label: 'match only',
    });
  });

  it('accepts a one-shot check with a plausible time, only when no window is present', () => {
    const plan = coercePlan(
      {
        title: 'June CPI',
        widgets: [{ type: 'chart', query: 'CPI release value' }],
        cadence: 'daily',
        oneShot: { at: '2026-07-11T08:30:00Z', label: 'CPI release' },
      },
      'june cpi release',
      now,
    );
    expect(plan!.oneShotAt).toBe(Date.parse('2026-07-11T08:30:00Z'));
    expect(plan!.oneShotLabel).toBe('CPI release');
  });

  it('drops an inverted window instead of accepting garbage', () => {
    const plan = coercePlan(
      {
        title: 'X',
        widgets: [{ type: 'list', query: 'q' }],
        cadence: 'hourly',
        window: { start: '2026-07-12T00:00:00Z', end: '2026-07-10T00:00:00Z', label: 'bad' },
      },
      'x',
      now,
    );
    expect(plan!.window).toBeUndefined();
  });

  it('drops a window or one-shot far outside a plausible near-future horizon (hallucination guard)', () => {
    const plan = coercePlan(
      {
        title: 'X',
        widgets: [{ type: 'list', query: 'q' }],
        cadence: 'hourly',
        window: { start: '2030-01-01T00:00:00Z', end: '2030-01-02T00:00:00Z', label: 'too far' },
        oneShot: { at: '2030-01-01T00:00:00Z', label: 'too far' },
      },
      'x',
      now,
    );
    expect(plan!.window).toBeUndefined();
    expect(plan!.oneShotAt).toBeUndefined();
  });

  it('never invents a window/one-shot when the model provides none — the planner has no search', () => {
    const plan = coercePlan(
      { title: 'X', widgets: [{ type: 'list', query: 'q' }], cadence: 'hourly' },
      'x',
      now,
    );
    expect(plan!.window).toBeUndefined();
    expect(plan!.oneShotAt).toBeUndefined();
  });
});

describe('answerOnce', () => {
  it('returns a grounded answer with native sources', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ answer: 'Mount Everest is 8,849 meters tall.' }),
      sources: [{ title: 'Britannica', url: 'https://example.com/everest' }],
    });
    const result = await answerOnce('height of everest', cfg);
    expect(result?.text).toBe('Mount Everest is 8,849 meters tall.');
    expect(result?.grounded).toBe(true);
    expect(result?.sources).toEqual([{ title: 'Britannica', url: 'https://example.com/everest' }]);
  });

  it('labels an ungrounded answer honestly rather than hiding it', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ answer: 'A plain answer.' }) });
    const result = await answerOnce('some fact', cfg);
    expect(result?.grounded).toBe(false);
    expect(result?.text).toBe('A plain answer.');
  });

  it('returns null on a dead call or an empty answer, never throwing', async () => {
    generateMock.mockRejectedValue(new Error('network down'));
    expect(await answerOnce('x', cfg)).toBeNull();
    generateMock.mockResolvedValue({ raw: JSON.stringify({ answer: '' }) });
    expect(await answerOnce('x', cfg)).toBeNull();
  });

  it('returns null for an empty ask without ever calling the model', async () => {
    expect(await answerOnce('   ', cfg)).toBeNull();
    expect(generateMock).not.toHaveBeenCalled();
  });
});
