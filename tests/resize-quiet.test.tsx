import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResizeQuiet } from '../src/lib/resizeQuiet';

// Locks the resize-quiet flag lifecycle: a resize marks <html data-resizing> so the docked face's
// position transition is suppressed (no slide), and the flag clears once resizing settles — and is
// always cleaned up on unmount. The actual transition drop is a CSS rule keyed on this attribute.
describe('useResizeQuiet', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.resizing;
  });

  it('sets data-resizing during resize and clears it after the window settles', () => {
    renderHook(() => useResizeQuiet());
    expect(document.documentElement.dataset.resizing).toBeUndefined();

    act(() => window.dispatchEvent(new Event('resize')));
    expect(document.documentElement.dataset.resizing).toBe('true');

    // Still resizing before the settle window elapses.
    act(() => vi.advanceTimersByTime(120));
    expect(document.documentElement.dataset.resizing).toBe('true');

    // Clears once resizing stops.
    act(() => vi.advanceTimersByTime(160));
    expect(document.documentElement.dataset.resizing).toBeUndefined();
  });

  it('debounces: a later resize extends the settle window', () => {
    renderHook(() => useResizeQuiet());
    act(() => window.dispatchEvent(new Event('resize')));
    act(() => vi.advanceTimersByTime(120));
    act(() => window.dispatchEvent(new Event('resize'))); // resets the timer
    act(() => vi.advanceTimersByTime(120));
    expect(document.documentElement.dataset.resizing).toBe('true');
    act(() => vi.advanceTimersByTime(160));
    expect(document.documentElement.dataset.resizing).toBeUndefined();
  });

  it('removes the listener and clears the flag on unmount', () => {
    const { unmount } = renderHook(() => useResizeQuiet());
    act(() => window.dispatchEvent(new Event('resize')));
    expect(document.documentElement.dataset.resizing).toBe('true');

    unmount();
    expect(document.documentElement.dataset.resizing).toBeUndefined();

    // A resize after unmount must not re-set the flag (listener was removed).
    act(() => window.dispatchEvent(new Event('resize')));
    expect(document.documentElement.dataset.resizing).toBeUndefined();
  });
});
