import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTapNarration, type TapNarrationOps } from '../src/canvas/focus/useTapNarration';
import type { Block } from '../src/data/conversation';

const SETTLE = 200; // mirrors SETTLE_MS in the hook

function blk(id: string, title: string | null = id): Block {
  return { type: 'insight', id, col: 6, props: { title } } as unknown as Block;
}

function makeOps(over: Partial<TapNarrationOps> = {}): TapNarrationOps {
  return {
    takeWheel: vi.fn(),
    hush: vi.fn(),
    moveSpot: vi.fn(),
    canSpeak: vi.fn(() => true),
    lineFor: vi.fn((b: Block) => (b.props as { title: string | null }).title ?? null),
    speakLine: vi.fn(),
    ...over,
  };
}

describe('useTapNarration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('speaks once — for the card you land on — across a rapid scrub', () => {
    const ops = makeOps();
    const { result } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => {
      result.current.narrate(blk('a'));
      result.current.narrate(blk('b'));
      result.current.narrate(blk('c'));
    });
    // The instant side effects fire on every tap; nothing is spoken yet (still settling).
    expect(ops.takeWheel).toHaveBeenCalledTimes(3);
    expect(ops.moveSpot).toHaveBeenCalledTimes(3);
    expect(ops.hush).toHaveBeenCalledTimes(3);
    expect(ops.speakLine).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(SETTLE));
    expect(ops.speakLine).toHaveBeenCalledTimes(1);
    expect(ops.speakLine).toHaveBeenCalledWith('c');
  });

  it('hushes + takes the wheel but never speaks when sound is off', () => {
    const ops = makeOps({ canSpeak: vi.fn(() => false) });
    const { result } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => {
      result.current.narrate(blk('a'));
      vi.advanceTimersByTime(SETTLE * 3);
    });
    expect(ops.takeWheel).toHaveBeenCalledTimes(1);
    expect(ops.hush).toHaveBeenCalledTimes(1);
    expect(ops.speakLine).not.toHaveBeenCalled();
    expect(result.current.narratingId).toBeNull();
  });

  it('pins a content-less card silently — responds to the tap but says nothing', () => {
    const ops = makeOps({ lineFor: vi.fn(() => null) });
    const { result } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => {
      result.current.narrate(blk('a', null));
      vi.advanceTimersByTime(SETTLE * 3);
    });
    expect(ops.moveSpot).toHaveBeenCalledTimes(1); // the tap still took the stage
    expect(ops.speakLine).not.toHaveBeenCalled();
    expect(result.current.narratingId).toBeNull();
  });

  it('lights the indicator for the narrated card, then clears it when the line ends', () => {
    const ops = makeOps();
    const { result } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => void result.current.narrate(blk('a')));
    expect(result.current.narratingId).toBe('a'); // committed on tap
    act(() => void vi.advanceTimersByTime(SETTLE));
    expect(ops.speakLine).toHaveBeenCalledTimes(1);
    expect(result.current.narratingId).toBe('a'); // still describing it
    act(() => void vi.advanceTimersByTime(8000)); // past the duration-estimate cap
    expect(result.current.narratingId).toBeNull();
  });

  it('toggles: re-tapping the active card hushes it, tapping again replays', () => {
    const ops = makeOps();
    const { result } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => {
      result.current.narrate(blk('a'));
      vi.advanceTimersByTime(SETTLE);
    });
    expect(ops.speakLine).toHaveBeenCalledTimes(1);
    // Re-tap while narrating 'a' → stop (no new line, indicator off).
    act(() => {
      result.current.narrate(blk('a'));
      vi.advanceTimersByTime(SETTLE);
    });
    expect(ops.speakLine).toHaveBeenCalledTimes(1);
    expect(result.current.narratingId).toBeNull();
    // Tap 'a' again → replays.
    act(() => {
      result.current.narrate(blk('a'));
      vi.advanceTimersByTime(SETTLE);
    });
    expect(ops.speakLine).toHaveBeenCalledTimes(2);
  });

  it('clears a pending line on unmount — no speak after the component is gone', () => {
    const ops = makeOps();
    const { result, unmount } = renderHook(() => useTapNarration(ops, 'ans'));
    act(() => void result.current.narrate(blk('a')));
    unmount();
    act(() => void vi.advanceTimersByTime(SETTLE * 4));
    expect(ops.speakLine).not.toHaveBeenCalled();
  });

  it('invalidates a pending line when a new answer (resetKey) arrives', () => {
    const ops = makeOps();
    const { result, rerender } = renderHook(({ k }) => useTapNarration(ops, k), {
      initialProps: { k: 'ans1' },
    });
    act(() => void result.current.narrate(blk('a')));
    rerender({ k: 'ans2' }); // a new answer lands before the line fires
    act(() => void vi.advanceTimersByTime(SETTLE * 4));
    expect(ops.speakLine).not.toHaveBeenCalled();
    expect(result.current.narratingId).toBeNull();
  });
});
