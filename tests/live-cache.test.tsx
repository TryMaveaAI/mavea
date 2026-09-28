// Answer cache: identical re-asks must hit the cache and never invoke the model a second time
// (zero extra tokens on the user's own key) — in the session and across a "New session". And,
// just as load-bearing: an answer must never be replayed for a question asked somewhere else in
// the conversation. A follow-up chip is never answered before it is tapped.
// Search cache: the same query fetched within the TTL must skip the network round-trip.
// All unit-tested here against mocked dependencies — no live API calls.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';
import { clearRippleCache } from '../src/live/ripple/cache';

// ── generateLive mock (hoisted — must precede the import below) ──────────────────────────────
const gen = {
  callCount: 0,
  asked: [] as string[],
  result: null as LiveResult | null,
  /** Answers for specific asks (a chip's own answer). */
  byText: new Map<string, LiveResult>(),
};

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (text: string) => {
    gen.callCount += 1;
    gen.asked.push(text);
    return gen.byText.get(text) ?? gen.result;
  }),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };
const otherCfg: ModelConfig = { provider: 'openai', model: 'gpt-x', apiKey: 'k2' };

function okResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Cache test',
      sub: '',
      opener: 'Same answer.',
      context: [],
      blocks: [
        {
          type: 'insight',
          id: 'i1',
          col: 12,
          num: '1',
          props: { title: 'Cached', summary: 'same' },
        },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'Same answer.',
    tier: 'frontier',
  };
}

/** An answer with follow-up chips under it. */
function withChips(...labels: string[]): LiveResult {
  const base = okResult();
  return {
    ...base,
    spec: {
      ...base.spec,
      suggests: labels.map((label) => ({ label, icon: 'spark' as const, route: '' })),
    },
  };
}

const thorough = { quality: 'thorough' } as ReturnType<
  NonNullable<Parameters<typeof useLiveTurn>[0]['getCaps']>
>;

/** How many times this exact question was put to the model. */
const timesAsked = (text: string): number => gen.asked.filter((t) => t === text).length;

/** Let anything a settled turn might still start run to completion. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  gen.callCount = 0;
  gen.asked = [];
  gen.result = okResult();
  gen.byText.clear();
  vi.clearAllMocks();
  // The persisted answers are device-local and deliberately outlive a session, so each test
  // starts from an empty store rather than inheriting the one before it.
  await clearRippleCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session answer cache', () => {
  it('dedupes an identical re-ask — generates only once', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(async () => {
      await result.current.run('what is 2+2?');
    });
    expect(gen.callCount).toBe(1);

    // "New session" clears what THIS session remembered — but the answer to a self-contained
    // question asked with nothing on screen is a function of the question and the config alone,
    // so the device's own copy still answers it. That is the point of persisting it: a reload,
    // a crash, or starting over must not re-bill a question already paid for.
    act(() => result.current.reset());
    await act(async () => {
      await result.current.run('what is 2+2?');
    });
    expect(gen.callCount).toBe(1);
  });

  // The old key was "text::history.LENGTH", which is a depth, not an identity. Once the running
  // history hit its cap — or, as here, a fresh start put a DIFFERENT conversation back at the
  // same depth — the same words matched an answer computed in another context entirely. That is
  // a wrong answer served instantly, the one failure a cache must never have.
  it('never replays an answer for the same question asked in a different conversation', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    const askX = () => result.current.run('so what changed?');

    await act(async () => {
      await result.current.run('tell me about the Apollo program');
    });
    await act(async () => {
      await askX();
    });
    expect(gen.callCount).toBe(2);

    // "New" (a fresh standalone start) puts a different conversation at the very same depth.
    await act(async () => {
      await result.current.run(
        'tell me about deep-sea vents',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { freshStart: true },
      );
    });
    // Same words, same depth, different conversation — this must go to the model.
    await act(async () => {
      await askX();
    });
    expect(gen.callCount).toBe(4);
  });

  it('does NOT dedupe when an attachment is present (unique input)', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    const fakeAttachment = { name: 'photo.png', mime: 'image/png', data: 'abc', size: 100 };

    await act(async () => {
      await result.current.run('describe this', [fakeAttachment] as Parameters<
        typeof result.current.run
      >[1]);
    });
    await act(async () => {
      await result.current.run('describe this', [fakeAttachment] as Parameters<
        typeof result.current.run
      >[1]);
    });
    // Attachment turns always go to the model — cache is bypassed for them.
    expect(gen.callCount).toBe(2);
  });

  it('caches across fresh-start turns at the same config, but busts on a provider/model switch', async () => {
    // freshStart turns always compute history.length === 0 (they ignore the running session),
    // so two of them asking the same question share the SAME answer-cache key without needing
    // reset() (which would clear the cache and defeat the point). This isolates exactly what the
    // key folds in: same question + same depth, config held constant vs. changed.
    let cur = cfg;
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cur }));
    const ask = () =>
      result.current.run(
        'what is the capital of France?',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { freshStart: true },
      );

    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(1);

    // Same question, same config, same (fresh-start) depth — a genuine cache HIT.
    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(1);

    // The user switches provider/model, then asks the identical question at the identical
    // depth. The cached answer was generated under `cfg` — it must not stand in for `otherCfg`.
    cur = otherCfg;
    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(2); // config changed — regenerated, not replayed from cfg's cache
  });

  // The signature has to fold in every cap that changes the ANSWER, not just the ones that change
  // the connection. Explanation level rewrites both the words and the visuals, so serving the
  // standard-level answer to someone who just asked for the simple one is a silent wrong answer.
  it('busts the cache when a cap that changes the answer is toggled', async () => {
    let caps = { quality: 'balanced', explainLevel: 'standard' } as ReturnType<
      NonNullable<Parameters<typeof useLiveTurn>[0]['getCaps']>
    >;
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, getCaps: () => caps }));
    const ask = () =>
      result.current.run(
        'how does a jet engine work?',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { freshStart: true },
      );

    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(1);

    // Same question, same caps — a genuine hit.
    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(1);

    // "Explain it simply" is a different answer to the same question.
    caps = { ...caps, explainLevel: 'simple' };
    await act(async () => {
      await ask();
    });
    expect(gen.callCount).toBe(2);
  });

  // Two inputs shape an answer that the key cannot see, and both make a stored copy a liability
  // rather than a saving: live web sources (yesterday's citations presented as today's answer)
  // and the user's remembered facts (the toggle is in the key; the facts move between sessions).
  it('never persists a web-grounded answer past the session that asked for it', async () => {
    gen.result = {
      ...okResult(),
      spec: {
        ...okResult().spec,
        sources: [{ title: 'Reuters', url: 'https://example.test/a' }],
      },
    };
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(async () => {
      await result.current.run("what is bitcoin's price?");
    });
    expect(gen.callCount).toBe(1);

    // New session: a grounded answer must be asked for again, not replayed from disk.
    act(() => result.current.reset());
    await act(async () => {
      await result.current.run("what is bitcoin's price?");
    });
    expect(gen.callCount).toBe(2);
  });

  it('ages a stored answer out — a day later the question is asked again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-17T09:00:00Z'));
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(async () => {
      await result.current.run('how do heat pumps work?');
    });
    expect(gen.callCount).toBe(1);

    // Later the same morning: still the device's answer, still free.
    vi.setSystemTime(new Date('2026-08-17T11:00:00Z'));
    act(() => result.current.reset());
    await act(async () => {
      await result.current.run('how do heat pumps work?');
    });
    expect(gen.callCount).toBe(1);

    // Past the day the stored copy is trusted for: a stored answer is a snapshot of what a model
    // knew, and the honest move once it is stale is to ask again.
    vi.setSystemTime(new Date('2026-08-18T12:00:00Z'));
    act(() => result.current.reset());
    await act(async () => {
      await result.current.run('how do heat pumps work?');
    });
    expect(gen.callCount).toBe(2);
  });
});

// A follow-up chip costs nothing until the reader taps it, on every quality dial, and a tap
// generates exactly like typing the same words.
describe('follow-up chips', () => {
  it('are never answered ahead of the tap, even on Thorough', async () => {
    gen.result = withChips('How much would it cost?', 'And in a smaller kitchen?');
    gen.byText.set('How much would it cost?', withChips('Compare the two'));
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getCaps: () => thorough }),
    );

    await act(async () => {
      await result.current.run('plan a kitchen refit');
    });
    await flush();
    expect(gen.asked).toEqual(['plan a kitchen refit']);

    await act(async () => {
      await result.current.run('How much would it cost?');
    });
    await flush();
    expect(timesAsked('How much would it cost?')).toBe(1);
    expect(timesAsked('And in a smaller kitchen?')).toBe(0);
    expect(timesAsked('Compare the two')).toBe(0);
  });
});

describe('the rate-limit guard speculative work reads', () => {
  // Quotas are per-minute. A background call made in the shadow of a 429 eats the budget the
  // reader's next question needs, so the Study's prefetched notes check this before spending.
  it('reports a recent provider 429, and only within its window', async () => {
    const { providerErrorDetail, recentlyRateLimited } = await import('../src/live/providers/http');
    expect(recentlyRateLimited()).toBe(false);
    await providerErrorDetail(
      new Response('{"error":{"message":"rate limited","status":"RESOURCE_EXHAUSTED"}}', {
        status: 429,
      }),
    );
    expect(recentlyRateLimited()).toBe(true);
    expect(recentlyRateLimited(0)).toBe(false);
  });
});
