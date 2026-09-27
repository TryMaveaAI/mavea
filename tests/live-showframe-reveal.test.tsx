import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { TurnFrame } from '../src/live/history';
import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };
function makeFrame(title: string): TurnFrame {
  return {
    question: `About ${title}?`,
    narration: `${title} narration.`,
    mode: 'replace',
    tour: [],
    at: 1,
    spec: {
      id: 'live',
      workspace: 'Live',
      title,
      sub: '',
      opener: '',
      context: [],
      blocks: [{ type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 's' } }],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('recorded frame visual and voice readiness', () => {
  it('renders immediately and prepares audio in parallel, but never speaks before paint', async () => {
    const ready = deferred();
    const speak = vi.fn();
    const prepareSpeech = vi.fn();
    const canvasReady = vi.fn(() => ready.promise);
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, speak, prepareSpeech, canvasReady }),
    );
    act(() => result.current.showFrame(makeFrame('Synced'), 'q'));
    expect(result.current.spec?.title).toBe('Synced');
    expect(prepareSpeech).toHaveBeenCalledWith('Synced narration.');
    expect(canvasReady).toHaveBeenCalledOnce();
    expect(speak).not.toHaveBeenCalled();
    await act(async () => ready.resolve());
    expect(speak).toHaveBeenCalledExactlyOnceWith('Synced narration.');
  });

  it('silent seeds keep authentic history without preparing or speaking audio', () => {
    const speak = vi.fn();
    const prepareSpeech = vi.fn();
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, speak, prepareSpeech }),
    );
    act(() =>
      result.current.showFrame(
        { ...makeFrame('Seeded'), tour: [{ index: 0, say: 'walk line' }] },
        'q',
        { silent: true },
      ),
    );
    expect(result.current.spec?.title).toBe('Seeded');
    expect(speak).not.toHaveBeenCalled();
    expect(prepareSpeech).not.toHaveBeenCalled();
    expect(result.current.tour).toEqual([]);
    expect(result.current.frames.at(-1)?.tour).toHaveLength(1);
  });

  it('muted replay does not delay silent recording behind visual readiness', () => {
    const speak = vi.fn();
    const canvasReady = vi.fn(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak, canvasReady }));
    act(() => result.current.showFrame(makeFrame('Muted'), 'q', { revealNow: true }));
    expect(result.current.spec?.title).toBe('Muted');
    expect(canvasReady).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledOnce();
  });

  it('cancels pending readiness when a newer frame replaces it', async () => {
    const ready = deferred();
    const speak = vi.fn();
    let signal: AbortSignal | undefined;
    const { result } = renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        speak,
        canvasReady: (s) => {
          signal = s;
          return ready.promise;
        },
      }),
    );
    act(() => result.current.showFrame(makeFrame('Stale'), 'q1'));
    act(() => result.current.showFrame(makeFrame('Fresh'), 'q2', { revealNow: true }));
    expect(signal?.aborted).toBe(true);
    await act(async () => ready.resolve());
    expect(result.current.spec?.title).toBe('Fresh');
    expect(speak).toHaveBeenCalledExactlyOnceWith('Fresh narration.');
  });

  it('unmount cancels readiness and prevents late speech', async () => {
    const ready = deferred();
    const speak = vi.fn();
    let signal: AbortSignal | undefined;
    const { result, unmount } = renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        speak,
        canvasReady: (s) => {
          signal = s;
          return ready.promise;
        },
      }),
    );
    act(() => result.current.showFrame(makeFrame('Gone'), 'q'));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => ready.resolve());
    expect(speak).not.toHaveBeenCalled();
  });
});
