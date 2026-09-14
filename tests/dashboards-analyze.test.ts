// dashboards-analyze.test.ts — analyzeMove is the ONE billable interpretation call: it must never
// throw (a failed call degrades to null, logged so it isn't silently invisible — see
// dashboards-verdict-honesty.test.ts for what the loop does with that null), and its `grounded`
// signal must reflect the SAME native-or-self-reported OR that generateLive.ts's main chat path
// uses, since a provider's native grounding metadata can come back empty even on a real search
// (the documented Gemini gotcha this whole mechanism exists for).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Dashboard, Tripwire } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import { analyzeMove } from '../src/live/dashboards/analyze';

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    thesis: { text: 'rates fall, tech wins', saidAt: 1 },
    metrics: [
      {
        id: 'm1',
        label: 'US 10Y',
        query: 'US 10 year treasury yield',
        sourceQuote: { text: 'because rates matter', saidAt: 0 },
        lastValue: 4.6,
        lastRaw: '4.6%',
        origin: 'search',
      },
    ],
    tripwires: [],
    ...over,
  }) as unknown as Dashboard;

const tw: Tripwire = {
  id: 't1',
  label: '10Y above 4.5%',
  metricId: 'm1',
  comparator: 'gt',
  threshold: 4.5,
  sourceQuote: { text: 'reconsider if 10Y tops 4.5%', saidAt: 0 },
  state: 'TRIGGERED',
  brokenValue: 4.6,
};

beforeEach(() => {
  generateMock.mockReset();
});

describe('analyzeMove — happy path', () => {
  it('returns the verdict text, timestamp, and a search-enabled request', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ verdict: 'Still on-thesis — this reads as noise.' }),
    });

    const v = await analyzeMove(dash({ tripwires: [tw] }), tw, cfg, 5000);
    expect(v).toEqual(
      expect.objectContaining({
        text: 'Still on-thesis — this reads as noise.',
        at: 5000,
        tripwireId: 't1',
        grounded: false,
      }),
    );
    expect(generateMock.mock.calls[0][0].tools).toEqual({ webSearch: true });
  });
});

describe('analyzeMove — thesis-free prompt', () => {
  it('reads the DATA, never the thesis: the prompt cites the metric, not the stated reasoning', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'ok' }) });
    await analyzeMove(dash({ tripwires: [tw] }), tw, cfg, 5000);
    const call = generateMock.mock.calls[0][0];
    expect(call.user).not.toContain('rates fall, tech wins'); // the thesis text
    expect(call.user).not.toContain('reconsider if 10Y tops 4.5%'); // the reasoning-flavored quote
    expect(call.user).toContain('US 10Y'); // the metric label
    expect(call.user).toContain('10Y above 4.5%'); // the numeric alert line
    expect(call.system.toLowerCase()).not.toContain('reasoning');
  });

  it('still produces a verdict when there is no thesis at all (thesis-independent)', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'Numbers are steady.' }) });
    const v = await analyzeMove(
      dash({ thesis: { text: '', saidAt: 0 }, tripwires: [tw] }),
      tw,
      cfg,
      5000,
    );
    expect(v?.text).toBe('Numbers are steady.');
    expect(generateMock.mock.calls[0][0].user).toContain('US 10Y');
  });
});

describe('analyzeMove — tripwireId', () => {
  it('is set for a tripwire-triggered call', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'Moved against you.' }) });
    const v = await analyzeMove(dash({ tripwires: [tw] }), tw, cfg, 5000);
    expect(v?.tripwireId).toBe('t1');
  });

  it('is omitted for a scheduled (non-tripwire) call', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'Holding fine.' }) });
    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v?.tripwireId).toBeUndefined();
  });
});

describe('analyzeMove — grounded', () => {
  it('is true from the adapter’s own native sources', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ verdict: 'Moved against you.' }),
      sources: [{ title: 'Treasury data', url: 'https://example.com/treasury' }],
    });
    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v?.grounded).toBe(true);
    expect(v?.sources).toEqual([{ title: 'Treasury data', url: 'https://example.com/treasury' }]);
  });

  it('is true from the self-reported inline "sources" fallback when native grounding is empty', async () => {
    // Mirrors the documented Gemini gotcha: a real search ran, but the adapter's own grounding
    // metadata came back empty — the model's inline sources array is the only surviving signal.
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        verdict: 'Moved against you.',
        sources: [{ title: 'Treasury data', url: 'https://example.com/treasury' }],
      }),
    });
    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v?.grounded).toBe(true);
  });

  it('is false when neither native nor self-reported sources are present', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'Holding fine.' }) });
    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v?.grounded).toBe(false);
  });
});

describe('analyzeMove — failure honesty', () => {
  it('returns null and logs the error instead of swallowing it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateMock.mockRejectedValue(new Error('network down'));

    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v).toBeNull();
    expect(spy).toHaveBeenCalledWith('[dashboards] analyzeMove failed', expect.any(Error));
    spy.mockRestore();
  });

  it('returns null (never fabricates) when the model gives no usable verdict text', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: '' }) });
    const v = await analyzeMove(dash(), 'scheduled', cfg, 5000);
    expect(v).toBeNull();
  });
});

// Reported from a live board: the tiles read WTI 103.25 / Brent 108.59 under "Strong evidence",
// while the written take below them said "WTI is unchanged at $100.05, Brent about $104.61",
// sourced from a days-old article the search happened to surface first. Two sets of numbers for
// one metric on one screen is worse than either alone — the reader cannot tell which to believe,
// and the one the product stands behind is the one it fetched and dated. The prompt used to hand
// over a bare `label=value` list, which says nothing about whose number wins, so the model
// treated its own search hits as the current level. Both halves of the fix are pinned here: the
// tracked values are declared authoritative, and each one carries the age of the VALUE so a model
// can say "as of two hours ago" instead of silently substituting something fresher-looking.
describe('analyzeMove — the tracked values are the authority', () => {
  it('tells the model not to restate a level from its own search results', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'ok' }) });
    await analyzeMove(dash({ tripwires: [tw] }), tw, cfg, 5000);
    const { system } = generateMock.mock.calls[0][0];
    expect(system).toMatch(/AUTHORITY/);
    expect(system).toMatch(/never quietly substitute/i);
    // A disagreeing source is not suppressed — it is attributed and dated, which is the honest
    // outcome and the only one that leaves the reader able to judge.
    expect(system).toMatch(/disagrees/i);
    expect(system).toMatch(/how old/i);
  });

  it('stamps each tracked reading with the age of the value, not of the check', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'ok' }) });
    const d = dash({
      tripwires: [tw],
      metrics: [
        { ...dash().metrics[0], asOf: 1_000_000 },
        {
          id: 'm2',
          label: 'Brent',
          query: 'brent crude price',
          sourceQuote: { text: 'q', saidAt: 0 },
          lastValue: null,
          lastRaw: null,
          origin: 'empty',
        },
      ],
    } as Partial<Dashboard>);
    await analyzeMove(d, tw, cfg, 1_000_000 + 2 * 60 * 60 * 1000);
    const { user } = generateMock.mock.calls[0][0];
    expect(user).toContain('US 10Y=4.6% (captured 2 hours ago)');
    // A metric that has never filled in says so, rather than reading as an em dash the model can
    // mistake for a value.
    expect(user).toContain('Brent=(never fetched)');
  });

  it('says plainly when a board has nothing tracked yet', async () => {
    generateMock.mockResolvedValue({ raw: JSON.stringify({ verdict: 'ok' }) });
    await analyzeMove(dash({ metrics: [], tripwires: [] }), 'scheduled', cfg, 5000);
    expect(generateMock.mock.calls[0][0].user).toContain('(no tracked values yet)');
  });
});
