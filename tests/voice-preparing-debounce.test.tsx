// The useVoicePreparing anti-flash hold: the raw synthesizing signal flips twice per spoken
// line, but React must only hear about HELD transitions — revealed after the 600ms hold, and
// never at all for a line that becomes audible inside it (the fast-machine case, where a
// flashing indicator at every stop would be churn, not honesty).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const state = vi.hoisted(() => ({
  preparing: false,
  listeners: new Set<() => void>(),
}));

vi.mock('../src/voice/tts', () => ({
  isSpeaking: () => false,
  isVoicePreparing: () => state.preparing,
  subscribeSpeaking: (l: () => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
}));

import { useVoicePreparing } from '../src/live/turnstate/useSpeaking';

const fire = (): void => {
  for (const l of state.listeners) l();
};

afterEach(() => {
  cleanup();
  state.preparing = false;
  vi.useRealTimers();
});

describe('useVoicePreparing', () => {
  it('reveals only after the anti-flash hold, and clears the instant audio starts', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoicePreparing());
    expect(result.current).toBe(false);

    act(() => {
      state.preparing = true;
      fire();
    });
    expect(result.current).toBe(false); // still inside the hold

    act(() => vi.advanceTimersByTime(599));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current).toBe(true);

    act(() => {
      state.preparing = false;
      fire();
    });
    expect(result.current).toBe(false); // instant clear, no lingering "preparing"
  });

  it('a fast line (audible inside the hold) never flashes the indicator', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoicePreparing());

    act(() => {
      state.preparing = true;
      fire();
    });
    act(() => {
      vi.advanceTimersByTime(300);
      state.preparing = false;
      fire();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it('releases its voice-store subscription when the last consumer unmounts', () => {
    const { unmount } = renderHook(() => useVoicePreparing());
    expect(state.listeners.size).toBe(1);
    unmount();
    expect(state.listeners.size).toBe(0);
  });
});
