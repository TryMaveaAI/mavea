// The useSpeakingHeld linger: the voice genuinely stops between two spoken lines, and a tour's
// stop-to-stop gap is longer still, so the voice strip's orb would flicker "Speaking → idle →
// Speaking" several times per answer. The hold lives outside React on purpose — subscribing a
// hook to the raw signal re-rendered LiveApp (the largest component in the app) on every flip,
// including the ones the held value never reflects.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({
  speaking: false,
  listeners: new Set<() => void>(),
}));

vi.mock('../src/voice/tts', () => ({
  isSpeaking: () => state.speaking,
  isVoicePreparing: () => false,
  subscribeSpeaking: (l: () => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
}));

import { useSpeakingHeld } from '../src/live/turnstate/useSpeaking';

const fire = (): void => {
  for (const l of state.listeners) l();
};

afterEach(() => {
  cleanup();
  state.speaking = false;
  vi.useRealTimers();
});

describe('useSpeakingHeld', () => {
  it('holds through the gap between two lines, so the pill never flickers', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpeakingHeld());
    expect(result.current).toBe(false);

    // Line one starts — audible immediately, no hold on the way up.
    act(() => {
      state.speaking = true;
      fire();
    });
    expect(result.current).toBe(true);

    // Line one ends. The next line is still being synthesized: the pill must NOT drop.
    act(() => {
      state.speaking = false;
      fire();
    });
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(400));
    expect(result.current).toBe(true);

    // Line two starts inside the linger — one continuous "Speaking", no transition at all.
    act(() => {
      state.speaking = true;
      fire();
    });
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);
  });

  it('clears once the voice has been quiet for the whole linger', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpeakingHeld());
    act(() => {
      state.speaking = true;
      fire();
    });
    act(() => {
      state.speaking = false;
      fire();
    });
    act(() => void vi.advanceTimersByTime(599));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('releases its subscription and timer when the last consumer unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSpeakingHeld());
    expect(state.listeners.size).toBe(1);
    act(() => {
      state.speaking = true;
      fire();
    });
    act(() => {
      state.speaking = false;
      fire();
    });
    unmount();
    // No listener left behind, and the pending linger timer cannot fire into a dead store.
    expect(state.listeners.size).toBe(0);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});
