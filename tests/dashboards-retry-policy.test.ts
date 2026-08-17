// Why a check died decides when it should be tried again. One flat five-minute retry treated a
// five-second rate window and a revoked key identically: the window wasted four minutes of
// staleness for nothing, and the dead key burned a doomed provider call every five minutes,
// forever, on the user's own account.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Dashboard } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import { refreshDashboards, buildRefreshBatch } from '../src/live/dashboards/refresh';

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'D',
    metrics: [
      {
        id: 'm1',
        label: 'Price',
        query: 'price now',
        sourceQuote: { text: 'x', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
    widgets: [],
    cadence: { data: 'hourly', ai: 'manual' },
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as Dashboard;

beforeEach(() => {
  generateMock.mockReset();
});

describe('a dead call is classified, not lumped together', () => {
  it('names a 429 as a rate limit and believes the wait the provider stated', async () => {
    generateMock.mockRejectedValue(
      new Error(
        'openai 429 Rate limit reached for gpt-5.4-nano on tokens per min (TPM). Please try again in 5.146s.',
      ),
    );
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.ok).toBe(false);
    expect(out.failure?.kind).toBe('rate-limit');
    expect(out.failure?.kind === 'rate-limit' && out.failure.retryAt).toBeGreaterThan(Date.now());
  });

  it('a rate limit with no stated wait still reads as a rate limit', async () => {
    generateMock.mockRejectedValue(new Error('anthropic 429 rate_limit_error'));
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.failure).toEqual({ kind: 'rate-limit' });
  });

  it('names a rejected key as auth — the one failure no amount of retrying fixes', async () => {
    generateMock.mockRejectedValue(new Error("openai 401 — Incorrect API key provided: ''."));
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.failure).toEqual({ kind: 'auth' });
  });

  it('names a 5xx as the provider being down, not the user being wrong', async () => {
    generateMock.mockRejectedValue(new Error('gemini 503 model overloaded'));
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.failure).toEqual({ kind: 'provider-unavailable' });
  });

  it('falls back to network for anything it cannot place', async () => {
    generateMock.mockRejectedValue(new Error('socket hang up'));
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.failure).toEqual({ kind: 'network' });
  });

  it('a successful call carries no failure at all', async () => {
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: [{ id: 'd1', values: { Price: 5 } }] }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const out = await refreshDashboards(buildRefreshBatch([dash()]), cfg);
    expect(out.ok).toBe(true);
    expect(out.failure).toBeUndefined();
  });
});
