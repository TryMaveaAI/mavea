// Always-on's mic must not silently keep claiming "listening" after a backgrounded tab or a
// sleeping device suspends VAD's own capture AudioContext — nothing else in the app ever
// reacted to that before this hook existed. Locks: hiding releases every active capture;
// returning restarts only always-on; and an inactive mic installs no listener.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAlwaysOnVisibility } from '../src/voice/useAlwaysOnVisibility';

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

describe('useAlwaysOnVisibility', () => {
  it('releases the mic on hide and restarts it on return only if not already listening', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const { rerender } = renderHook(
      ({ listening }: { listening: boolean }) =>
        useAlwaysOnVisibility(
          { alwaysOn: true, sttOk: true, composerHasText: false, listening },
          { start, stop },
        ),
      { initialProps: { listening: true } },
    );

    setHidden(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();

    // Comes back while the controller still reports itself listening — no restart needed.
    setHidden(false);
    expect(start).not.toHaveBeenCalled();

    // This time the session went stale in the background (not listening on return) — restart.
    rerender({ listening: false });
    setHidden(true);
    expect(stop).toHaveBeenCalledTimes(1); // already released; no redundant controller work
    setHidden(false);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does nothing when always-on is not the active mode', () => {
    const start = vi.fn();
    const stop = vi.fn();
    renderHook(() =>
      useAlwaysOnVisibility(
        { alwaysOn: false, sttOk: true, composerHasText: false, listening: false },
        { start, stop },
      ),
    );

    setHidden(true);
    setHidden(false);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('releases tap/hold capture on hide and never restarts it without a new gesture', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const { rerender } = renderHook(
      ({ listening }: { listening: boolean }) =>
        useAlwaysOnVisibility(
          { alwaysOn: false, sttOk: true, composerHasText: false, listening },
          { start, stop },
        ),
      { initialProps: { listening: true } },
    );

    setHidden(true);
    expect(stop).toHaveBeenCalledTimes(1);
    rerender({ listening: false });
    setHidden(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const { unmount } = renderHook(() =>
      useAlwaysOnVisibility(
        { alwaysOn: true, sttOk: true, composerHasText: false, listening: true },
        { start, stop },
      ),
    );
    unmount();
    setHidden(true);
    expect(stop).not.toHaveBeenCalled();
  });
});
