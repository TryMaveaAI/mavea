// A provider backoff is always shown to the reader, exactly once: inline by a caller that passes
// its own `onWait` (the Live turn, the world), otherwise by the app shell's shared status line.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { geminiAdapter } from '../src/live/providers/gemini';
import { subscribeProviderWait, waitReporter, type ProviderWait } from '../src/live/providers/wait';
import { ANNOUNCE_DELAY_MS, ProviderWaitStatus } from '../src/ProviderWaitStatus';
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
  const pillOf = (root: HTMLElement): HTMLElement => root.querySelector('.provider-wait')!;

  it('counts the wait down on screen, clears it, and stops listening on unmount', () => {
    vi.useFakeTimers();
    const report = waitReporter();
    const { container, unmount } = render(<ProviderWaitStatus />);
    const pill = pillOf(container);
    expect(pill.textContent).toBe('');

    act(() => report(3_000, 'rate-limit'));
    expect(pill.textContent).toContain('retrying in 3s');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(pill.textContent).toContain('retrying in 2s');

    act(() => report(null));
    expect(pill.textContent).toBe('');

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

  it('says the wait once to a screen reader, rather than reading the countdown aloud', () => {
    vi.useFakeTimers();
    const report = waitReporter();
    const { container, unmount } = render(<ProviderWaitStatus />);
    // Idle: no live region at all, and the visible pill stays out of the accessibility tree.
    expect(screen.queryByRole('status')).toBeNull();
    expect(pillOf(container).getAttribute('aria-hidden')).toBe('true');

    act(() => report(5_000, 'rate-limit'));
    const region = screen.getByRole('status');
    // The region exists before it speaks, so the words arrive as a change it can announce.
    expect(region.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    expect(region.textContent).toBe('Your provider asked Mavéa to wait. Retrying in 5 seconds.');
    const said = region.textContent;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole('status').textContent).toBe(said);

    act(() => report(null));
    expect(screen.queryByRole('status')).toBeNull();
    unmount();
  });

  it('raises the pill into the top layer while it waits, and lowers it after', () => {
    const shown = vi.fn();
    const hidden = vi.fn();
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.showPopover = shown;
    proto.hidePopover = hidden;
    try {
      const report = waitReporter();
      const { container, unmount } = render(<ProviderWaitStatus />);
      expect(pillOf(container).getAttribute('popover')).toBe('manual');
      expect(shown).not.toHaveBeenCalled();
      act(() => report(2_000, 'rate-limit'));
      expect(shown).toHaveBeenCalledTimes(1);
      act(() => report(null));
      expect(hidden).toHaveBeenCalledTimes(1);
      unmount();
    } finally {
      delete proto.showPopover;
      delete proto.hidePopover;
    }
  });

  it('speaks from inside an open modal, which hides everything outside it', async () => {
    vi.useFakeTimers();
    const report = waitReporter();
    const { unmount } = render(<ProviderWaitStatus />);
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    // A closed overlay still mounted in the tree is no place to speak from.
    const closed = document.createElement('div');
    closed.setAttribute('aria-modal', 'true');
    closed.hidden = true;
    document.body.append(modal, closed);
    try {
      act(() => report(4_000, 'rate-limit'));
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
      });
      expect(modal.querySelector('[role="status"]')?.textContent).toContain('Retrying in 4');

      // The reader closes the overlay mid-wait: the line follows them back to the page and is said
      // again there, since it was last heard inside a subtree that is gone.
      modal.remove();
      await act(async () => {
        await Promise.resolve();
      });
      const region = screen.getByRole('status');
      expect(modal.contains(region)).toBe(false);
      act(() => {
        vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
      });
      expect(region.textContent).toContain('Retrying in');
      act(() => report(null));
    } finally {
      closed.remove();
      unmount();
    }
  });
});
