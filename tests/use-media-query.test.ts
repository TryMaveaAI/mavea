// The Lens grows its card only on a large monitor, and it learns which window it is in through
// this hook — so it has to follow the window as it changes and let go of its listener.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from '../src/lib/useMediaQuery';

function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const list = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => list),
  );
  return {
    listeners,
    set(next: boolean) {
      matches = next;
      for (const fn of listeners) fn();
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the query as the window changes and unsubscribes on unmount', () => {
    const mq = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery('(width > 1920px)'));
    expect(result.current).toBe(false);

    act(() => mq.set(true));
    expect(result.current).toBe(true);

    unmount();
    expect(mq.listeners.size).toBe(0);
  });

  it('reads as no match where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useMediaQuery('(width > 1920px)'));
    expect(result.current).toBe(false);
  });
});
