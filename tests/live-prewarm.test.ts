import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prewarmLive, _resetPrewarmForTest } from '../src/live/prewarm';
import { getAdapter } from '../src/live/providers';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import { acceptLegalTerms, resetLegalAcceptance } from '../src/legal/acceptance';

// prewarmLive opens the network path ahead of the first turn: it probes the connected provider
// (warming DNS/TLS + the same-origin proxy hop) and pings the TTS service. It must be a cheap,
// throttled, never-throws nicety — these prove it warms the right provider, wakes TTS, and
// collapses a focus burst to a single round-trip.

beforeEach(() => {
  _resetPrewarmForTest();
  resetLegalAcceptance();
  expect(acceptLegalTerms(new Date('2026-07-16T12:00:00.000Z'))).toBe(true);
  // Default provider is Gemini; pin it explicitly so the assertions don't drift with defaults.
  setLiveConfigV2({ provider: 'gemini' });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetLegalAcceptance();
  _resetPrewarmForTest();
});

describe('prewarmLive', () => {
  it('does not contact a provider, STT, or TTS before legal acknowledgement', () => {
    resetLegalAcceptance();
    const probe = vi
      .spyOn(getAdapter('gemini'), 'probe')
      .mockResolvedValue({ ok: true, model: true });

    prewarmLive({ force: true });

    expect(probe).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('probes the connected provider and pings the TTS health endpoint', () => {
    const probe = vi
      .spyOn(getAdapter('gemini'), 'probe')
      .mockResolvedValue({ ok: true, model: true });

    prewarmLive();

    expect(probe).toHaveBeenCalledTimes(1);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const ttsCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/tts/health'));
    expect(ttsCall).toBeTruthy();
  });

  it('throttles repeated warms within the cooldown to a single round-trip', () => {
    const probe = vi
      .spyOn(getAdapter('gemini'), 'probe')
      .mockResolvedValue({ ok: true, model: true });

    prewarmLive();
    prewarmLive();
    prewarmLive();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('force bypasses the cooldown (e.g. an explicit re-warm)', () => {
    const probe = vi
      .spyOn(getAdapter('gemini'), 'probe')
      .mockResolvedValue({ ok: true, model: true });

    prewarmLive();
    prewarmLive({ force: true });

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('never throws when the probe rejects', () => {
    vi.spyOn(getAdapter('gemini'), 'probe').mockRejectedValue(new Error('offline'));
    expect(() => prewarmLive()).not.toThrow();
  });

  // The health ping only wakes the container — Kokoro's model loads lazily on the FIRST
  // synthesis, which used to cost the opening line 10-20 cold seconds on an old machine. A
  // healthy ping must therefore trigger exactly one throwaway synthesis per session.
  it('warms the synthesis model once after a healthy TTS ping, never twice', async () => {
    vi.spyOn(getAdapter('gemini'), 'probe').mockResolvedValue({ ok: true, model: true });
    prewarmLive();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tts/v1/audio/speech')),
      ).toHaveLength(1);
    });
    // A later warm (past the cooldown) re-pings health but must not re-synthesize.
    prewarmLive({ force: true });
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tts/health'))).toHaveLength(
        2,
      );
    });
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tts/v1/audio/speech')),
    ).toHaveLength(1);
  });

  it('skips the synthesis warm when the TTS service is down', async () => {
    vi.spyOn(getAdapter('gemini'), 'probe').mockResolvedValue({ ok: true, model: true });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) => {
        if (String(url).includes('/tts/health'))
          return Promise.resolve(new Response(null, { status: 503 }));
        return Promise.resolve(new Response('{}', { status: 200 }));
      }),
    );
    prewarmLive();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/tts/health'))).toBe(true);
    });
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/tts/v1/audio/speech')),
    ).toEqual([]);
  });

  // Anthropic's readiness probe deliberately spends a token (POST /v1/messages) because /v1/models
  // can pass while generation 401s. Warming isn't a readiness question, though — it fires whenever
  // the composer takes focus, and billing someone's key for that is indefensible. It must take the
  // adapter's free `warm()` path instead.
  it('warms Anthropic without spending a token on the generation endpoint', async () => {
    setLiveConfigV2({ provider: 'anthropic', keys: { anthropic: 'sk-test' } });
    const probe = vi.spyOn(getAdapter('anthropic'), 'probe');

    prewarmLive();
    await vi.waitFor(() => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/v1/models'))).toBe(true);
    });

    expect(probe).not.toHaveBeenCalled();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const billable = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/v1/messages'));
    expect(billable).toEqual([]);
  });
});
