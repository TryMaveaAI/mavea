// A provider backoff is always shown to the reader, exactly once: inline by a caller that passes its
// own `onWait` (the Live turn, the world), otherwise by the app shell's shared status line.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { geminiAdapter } from '../src/live/providers/gemini';
import { subscribeProviderWait, waitReporter, type ProviderWait } from '../src/live/providers/wait';
import { ProviderWaitStatus } from '../src/ProviderWaitStatus';
import type { LiveRequest } from '../src/live/providers/types';
import type { ModelConfig } from '../src/types/mavea';

const cfg: ModelConfig = { provider: 'gemini', model: 'reader-pick', apiKey: 'k' };
const ask: LiveRequest = { system: 's', history: [], user: 'hi' };

/** One 429 naming a short retry-after, then an answer. */
function rateLimitedOnce(): void {
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('{"error":{"message":"slow down"}}', {
          status: 429,
          headers: { 'retry-after': '2' },
        });
      }
      return new Response('data: {"candidates":[{"content":{"parts":[{"text":"{}"}]}}]}\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the shared provider-wait channel', () => {
  it('carries the backoff of a request that shows no wait of its own', async () => {
    vi.useFakeTimers();
    rateLimitedOnce();
    const seen: (ProviderWait | null)[] = [];
    const stop = subscribeProviderWait((w) => seen.push(w));
    try {
      const done = geminiAdapter.generate(ask, cfg);
      await vi.advanceTimersByTimeAsync(3_000);
      await done;
    } finally {
      stop();
    }
    expect(seen[0]).toBeNull();
    expect(seen.some((w) => w?.reason === 'rate-limit')).toBe(true);
    expect(seen.at(-1)).toBeNull(); // cleared once the re-send went out
  });

  it('stays silent for a request that shows its own wait, so nothing is shown twice', async () => {
    vi.useFakeTimers();
    rateLimitedOnce();
    const seen: (ProviderWait | null)[] = [];
    const own = vi.fn();
    const stop = subscribeProviderWait((w) => seen.push(w));
    try {
      const done = geminiAdapter.generate({ ...ask, onWait: own }, cfg);
      await vi.advanceTimersByTimeAsync(3_000);
      await done;
    } finally {
      stop();
    }
    expect(own).toHaveBeenCalledWith(expect.any(Number), 'rate-limit');
    expect(seen).toEqual([null]);
  });
});

describe('ProviderWaitStatus', () => {
  it('counts the wait down politely, clears it, and stops listening on unmount', () => {
    vi.useFakeTimers();
    const report = waitReporter();
    const { unmount } = render(<ProviderWaitStatus />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    act(() => report(3_000, 'rate-limit'));
    expect(region.textContent).toContain('retrying in 3s');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(region.textContent).toContain('retrying in 2s');

    act(() => report(null));
    expect(region.textContent).toBe('');

    unmount();
    // A wait published after unmount reaches no component (no state update on a dead tree).
    const listener = vi.fn();
    const stop = subscribeProviderWait(listener);
    report(1_000);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'rate-limit' }));
    report(null);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
