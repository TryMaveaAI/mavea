import { renderHook, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { speculate } from '../src/live/ghost/speculate';
import { useGhosts } from '../src/live/ghost/useGhosts';
import type { ModelConfig } from '../src/live/providers/types';

// Ghost blocks: the glimpse parses loose model JSON into ≤3 titled ghosts and fails to
// nothing; the hook waits for the transcript to settle, caps its glimpses, and drops
// everything the instant listening ends.

const generate = vi.fn();
vi.mock('../src/live/providers', () => ({
  getAdapter: () => ({ generate: (...a: unknown[]) => generate(...a) }),
}));

const cfg = { provider: 'gemini', model: 'gemini-3.1-flash-lite' } as unknown as ModelConfig;

beforeEach(() => generate.mockReset());
afterEach(cleanup);

describe('speculate', () => {
  it('parses ghosts out of prose-wrapped JSON, capped and kind-snapped', async () => {
    generate.mockResolvedValue({
      raw: 'Sure! {"ghosts":[{"kind":"forming","title":"Bloom forecast"},{"kind":"weird","title":"Late-April flights"},{"title":""},{"kind":"maybe","title":"Kyoto instead?"},{"kind":"maybe","title":"Fourth"}]}',
    });
    const out = await speculate('we are thinking Tokyo in May', cfg, new AbortController().signal);
    expect(out).toEqual([
      { kind: 'forming', title: 'Bloom forecast' },
      { kind: 'forming', title: 'Late-April flights' }, // unknown kind snaps to forming
      { kind: 'maybe', title: 'Kyoto instead?' },
    ]);
  });

  // The abort used to only discard the reply: a superseded glimpse kept generating to completion
  // on the user's own key. The signal has to reach the adapter's fetch to actually stop it.
  it('hands the abort signal to the adapter so a superseded glimpse stops generating', async () => {
    generate.mockResolvedValue({ raw: { ghosts: [] } });
    const ctrl = new AbortController();
    await speculate('half a question', cfg, ctrl.signal);
    expect((generate.mock.calls[0][0] as { signal?: AbortSignal }).signal).toBe(ctrl.signal);
  });

  // A glimpse is disposable — a tiny cap plus an explicit minimal-thinking hint is what keeps
  // three-per-listen speculation from billing reasoning-model deliberation for six-word titles.
  it('asks for a tiny budget and minimal thinking (a glimpse must stay cheap)', async () => {
    generate.mockResolvedValue({ raw: { ghosts: [] } });
    await speculate('half a question', cfg, new AbortController().signal);
    const req = generate.mock.calls[0][0] as { maxTokens?: number; thinkingLevel?: string };
    expect(req.maxTokens).toBe(150);
    expect(req.thinkingLevel).toBe('minimal');
  });

  it('resolves [] on unparseable output or an aborted glimpse', async () => {
    generate.mockResolvedValue({ raw: 'I would build you three lovely cards!' });
    const out = await speculate('half a question', cfg, new AbortController().signal);
    expect(out).toEqual([]);
    generate.mockResolvedValue({ raw: { ghosts: [{ kind: 'forming', title: 'X' }] } });
    const aborted = new AbortController();
    aborted.abort();
    expect(await speculate('half a question', cfg, aborted.signal)).toEqual([]);
  });
});

describe('useGhosts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('glimpses after the transcript settles, and clears when listening ends', async () => {
    generate.mockResolvedValue({
      raw: { ghosts: [{ kind: 'forming', title: 'Bloom forecast' }] },
    });
    const { result, rerender } = renderHook(
      ({ listening, partial }) => useGhosts(listening, partial, cfg),
      { initialProps: { listening: true, partial: 'we are thinking Tokyo in May' } },
    );
    expect(result.current).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current).toEqual([{ kind: 'forming', title: 'Bloom forecast' }]);
    rerender({ listening: false, partial: null as unknown as string });
    expect(result.current).toEqual([]);
  });

  // Once the real turn is streaming, guessing at the answer bills the user's key to preview what
  // they're about to be shown anyway — so speculation stands down and any glimpse already on screen
  // gets out of the answer's way.
  it('suspends speculation while a real turn is in flight', async () => {
    generate.mockResolvedValue({
      raw: { ghosts: [{ kind: 'forming', title: 'Bloom forecast' }] },
    });
    const { result, rerender } = renderHook(
      ({ suspended, partial }) => useGhosts(true, partial, cfg, suspended),
      { initialProps: { suspended: false, partial: 'we are thinking Tokyo in May' } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current).toEqual([{ kind: 'forming', title: 'Bloom forecast' }]);

    // The turn starts: existing ghosts clear immediately...
    rerender({ suspended: true, partial: 'we are thinking Tokyo in May' });
    expect(result.current).toEqual([]);

    // ...and a fresh settled transcript spends nothing while it stays in flight.
    generate.mockClear();
    rerender({ suspended: true, partial: 'and maybe Kyoto for a few days as well' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('too few words → no glimpse; the budget caps repeated glimpses', async () => {
    generate.mockResolvedValue({ raw: { ghosts: [{ kind: 'forming', title: 'X' }] } });
    const { rerender } = renderHook(({ partial }) => useGhosts(true, partial, cfg), {
      initialProps: { partial: 'hey so' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(generate).not.toHaveBeenCalled();
    // Four distinct settled transcripts → only MAX_GLIMPSES (3) calls.
    for (const p of [
      'one two three four',
      'one two three four five',
      'a b c d e f',
      'a b c d e f g',
    ]) {
      rerender({ partial: p });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
    }
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
