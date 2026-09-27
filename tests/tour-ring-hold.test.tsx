import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { MAX_HOLD_MS, useElementRect } from '../src/tour/useElementRect';

// The walkthrough's ring is drawn off this rect. It must not appear on a control still gliding
// into place (it chased the target across the screen), yet a control that never holds still
// still gets rung once the hold runs out.
function target(top: () => number): HTMLElement {
  const el = document.createElement('button');
  el.className = 'ring-me';
  el.getBoundingClientRect = () => new DOMRect(100, top(), 80, 40);
  document.body.appendChild(el);
  return el;
}

describe('useElementRect — rings a control once it has come to rest', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('holds the ring until two frames agree on where the control is', async () => {
    let top = 300;
    target(() => top);
    const { result } = renderHook(() => useElementRect('.ring-me', true));
    // First read: nothing to agree with yet.
    expect(result.current).toBeNull();
    // Still moving on the next frame: still held.
    top = 280;
    await act(() => vi.advanceTimersByTimeAsync(16));
    expect(result.current).toBeNull();
    // Two frames at the same place: rung, where it rests.
    await act(() => vi.advanceTimersByTimeAsync(32));
    expect(result.current?.top).toBe(280);
  });

  it('rings a control that never holds still once the hold runs out', async () => {
    let top = 300;
    target(() => (top += 1));
    const { result } = renderHook(() => useElementRect('.ring-me', true));
    await act(() => vi.advanceTimersByTimeAsync(MAX_HOLD_MS / 2));
    expect(result.current).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(MAX_HOLD_MS));
    expect(result.current).not.toBeNull();
  });
});
