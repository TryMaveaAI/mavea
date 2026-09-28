// useElementRect lets a tour chapter name a couple of candidate spotlight anchors as a CSS
// selector list ("a, b"), meant to be tried in LISTED priority order (the real control first, a
// fallback second — see the 'ask' chapter in tourPlan.ts). A naive single querySelector() call on
// the joined list instead resolves by DOCUMENT order, which silently rings whichever candidate
// happens to render earlier in the DOM regardless of which one is meant as primary.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useElementRect } from '../src/tour/useElementRect';

function stubRect(el: HTMLElement, w: number, h: number, left = 10, top = 10): void {
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      left,
      top,
      right: left + w,
      bottom: top + h,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** The ring shows once two frames agree on where its target is; step one frame past the first
 *  read so the confirming one lands. */
async function confirm(): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(16));
}

describe('useElementRect — priority-ordered selector lists', () => {
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
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('prefers the first-LISTED selector even when it renders later in the DOM', async () => {
    // The fallback mounts FIRST in the DOM (mirrors LiveApp's dismissible ask-hint banner, which
    // renders before the canvas holding the real per-card Ask pill).
    const fallback = document.createElement('div');
    fallback.className = 'fallback';
    document.body.appendChild(fallback);
    stubRect(fallback, 40, 20);

    const primary = document.createElement('div');
    primary.className = 'primary';
    document.body.appendChild(primary);
    stubRect(primary, 60, 30, 100, 100);

    const { result } = renderHook(() => useElementRect('.primary, .fallback', true));
    // A single read is unconfirmed: nothing is rung until the next frame agrees with it.
    expect(result.current).toBeNull();
    await confirm();
    expect(result.current?.width).toBe(60);
    expect(result.current?.left).toBe(100);
  });

  it('falls through to the next candidate when the first-listed one is hidden', async () => {
    const primary = document.createElement('div');
    primary.className = 'primary';
    primary.checkVisibility = () => false;
    document.body.appendChild(primary);
    stubRect(primary, 60, 30);

    const fallback = document.createElement('div');
    fallback.className = 'fallback';
    document.body.appendChild(fallback);
    stubRect(fallback, 40, 20, 5, 5);

    const { result } = renderHook(() => useElementRect('.primary, .fallback', true));
    await confirm();
    expect(result.current?.width).toBe(40);
  });

  it('uses the on-screen copy when a responsive control appears more than once', async () => {
    const offscreen = document.createElement('button');
    offscreen.className = 'primary';
    document.body.appendChild(offscreen);
    stubRect(offscreen, 60, 30, 10, window.innerHeight + 100);

    const onscreen = document.createElement('button');
    onscreen.className = 'primary';
    document.body.appendChild(onscreen);
    stubRect(onscreen, 72, 36, 120, 120);

    const { result } = renderHook(() => useElementRect('.primary', true));
    await confirm();
    expect(result.current?.width).toBe(72);
    expect(result.current?.left).toBe(120);
  });

  it('returns null when no candidate is present', () => {
    const { result } = renderHook(() => useElementRect('.primary, .fallback', true));
    expect(result.current).toBeNull();
  });
});
