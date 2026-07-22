// dashboards-refine-query.test.ts — refineRefreshQuery turns a one-off, often time-relative ask
// ("today's scores") into a canonical query meant to be re-sent verbatim on every future refresh.
// Locks the honesty property that matters most: it must never come back empty, and a failed call
// must fall back to the raw ask rather than losing the query entirely.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import { refineRefreshQuery } from '../src/live/dashboards/refineQuery';

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

beforeEach(() => {
  generateMock.mockReset();
});

describe('refineRefreshQuery', () => {
  it('returns the model-rewritten query on success', async () => {
    generateMock.mockResolvedValue({
      raw: 'current FIFA World Cup 2026 Round of 16 results, including any match in progress',
    });
    const out = await refineRefreshQuery(
      "what are the scores for today's world cup games",
      'timeline',
      cfg,
    );
    expect(out).toBe(
      'current FIFA World Cup 2026 Round of 16 results, including any match in progress',
    );
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('strips surrounding quotes the model sometimes adds', async () => {
    generateMock.mockResolvedValue({ raw: '"AAPL current stock price"' });
    const out = await refineRefreshQuery('AAPL price', 'insight', cfg);
    expect(out).toBe('AAPL current stock price');
  });

  it('falls back to the raw ask when the call throws', async () => {
    generateMock.mockRejectedValue(new Error('network error'));
    const out = await refineRefreshQuery('add yankees scores', 'scoreboard', cfg);
    expect(out).toBe('add yankees scores');
  });

  it('falls back to the raw ask when the model returns nothing usable', async () => {
    generateMock.mockResolvedValue({ raw: '   ' });
    const out = await refineRefreshQuery('track AAPL', 'insight', cfg);
    expect(out).toBe('track AAPL');
  });

  it('never calls the model for an empty ask', async () => {
    const out = await refineRefreshQuery('   ', 'insight', cfg);
    expect(out).toBe('');
    expect(generateMock).not.toHaveBeenCalled();
  });
});
