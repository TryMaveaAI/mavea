import { renderHook, act } from '@testing-library/react';
import {
  useInterjections,
  type InterjectGates,
  type UseInterjectionsOptions,
} from '../src/live/interject/useInterjections';

// Exercises the controller's decision to step in (and to stay quiet). The cadence words/policy are
// covered by interject-catalog / interject-ratelimit; here we lock the gating + emerge + preempt —
// including the regression guard that Live rests at 'showing', so the gate is "at rest", not "idle".

const OPEN: InterjectGates = {
  atRest: true,
  busy: false,
  listening: false,
  introHold: false,
  hasCanvas: true,
  modalOpen: false,
};

function props(over: Partial<UseInterjectionsOptions> = {}): UseInterjectionsOptions {
  return {
    speak: vi.fn(() => ({ cancel: vi.fn() })),
    isSpeaking: () => false,
    muted: false,
    turnCount: 5,
    gates: OPEN,
    ...over,
  };
}

describe('useInterjections — when Mavéa steps into the conversation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('emerges and speaks when a moment is enqueued at rest', () => {
    const speak = vi.fn();
    const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props({ speak }),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(true);
    expect(result.current.line).toBeTruthy();
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('stays quiet mid-turn — the regression guard (atRest false)', () => {
    const speak = vi.fn();
    const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props({ speak, gates: { ...OPEN, atRest: false } }),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(false);
    expect(speak).not.toHaveBeenCalled();
  });

  it('stays quiet while the mic is open or a modal is up, or on the welcome', () => {
    for (const gates of [
      { ...OPEN, listening: true },
      { ...OPEN, modalOpen: true },
      { ...OPEN, hasCanvas: false },
    ]) {
      const speak = vi.fn();
      const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
        initialProps: props({ speak, gates }),
      });
      act(() => result.current.enqueue('clipShared'));
      expect(result.current.interjecting).toBe(false);
      expect(speak).not.toHaveBeenCalled();
    }
  });

  it('shows the aside silently when muted', () => {
    const speak = vi.fn();
    const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props({ speak, muted: true }),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(true);
    expect(result.current.line).toBeTruthy();
    expect(speak).not.toHaveBeenCalled();
  });

  it('waits for the answer to finish speaking before stepping in', () => {
    let speaking = true;
    const speak = vi.fn();
    const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props({ speak, isSpeaking: () => speaking }),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(false); // still narrating the answer
    speaking = false;
    act(() => vi.advanceTimersByTime(400)); // the re-check timer fires
    expect(result.current.interjecting).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('a starting user turn preempts an in-flight aside', () => {
    const speak = vi.fn();
    const { result, rerender } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props({ speak }),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(true);
    act(() => rerender(props({ speak, gates: { ...OPEN, atRest: false, busy: true } })));
    expect(result.current.interjecting).toBe(false);
  });

  it("an opened overlay stops only the aside's own line, never the narration after it", () => {
    // The hook holds the aside's line and nothing else, so its stop cannot reach the narration;
    // that one line's stop leaving the rest of the queue playing is kokoro-line-cancel's to pin.
    const asideLine = { cancel: vi.fn() };
    const speak = vi.fn(() => asideLine);
    let speaking = false;
    const base = props({ speak, isSpeaking: () => speaking });
    const { result, rerender } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: base,
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(true);
    // Narration has started since, so the hold keeps the aside up past its own line.
    speaking = true;
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.interjecting).toBe(true);

    act(() => rerender({ ...base, gates: { ...OPEN, modalOpen: true } }));
    expect(result.current.interjecting).toBe(false);
    expect(asideLine.cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('reset clears an in-flight aside', () => {
    const { result } = renderHook((p: UseInterjectionsOptions) => useInterjections(p), {
      initialProps: props(),
    });
    act(() => result.current.enqueue('clipShared'));
    expect(result.current.interjecting).toBe(true);
    act(() => result.current.reset());
    expect(result.current.interjecting).toBe(false);
    expect(result.current.line).toBeNull();
  });
});
