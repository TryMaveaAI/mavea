// FitScale's re-measure trigger, the deterministic replacement for the old settle loop (a bounded
// rAF loop plus two setTimeout catch-ups). jsdom has no real layout, so this can't validate actual
// pixel fitting the way the #/reel gallery's overflow audit does — it validates the WIRING: that
// bumping ReelUnitsVersion (what ReelPlayer does the instant it upgrades --ru/--rw) makes FitScale
// re-run its measurement synchronously, with nothing else — no resize, no children change — needed
// to trigger it.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { FitScale } from '../src/clip/reel/FitScale';
import { ReelUnitsVersion } from '../src/clip/reel/reelUnits';

afterEach(cleanup);

// jsdom lays out nothing, so FitScale's measure() sees all-zero boxes unless a test hand-supplies
// them — the same reason reel-keyboard.test.ts stubs ResizeObserver rather than trusting jsdom's.
function stubBox(el: HTMLElement, w: number, h: number): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: h });
}

class InertResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
let RealResizeObserver: typeof ResizeObserver | undefined;
beforeEach(() => {
  RealResizeObserver = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', InertResizeObserver as unknown as typeof ResizeObserver);
});
afterEach(() => {
  vi.stubGlobal('ResizeObserver', RealResizeObserver);
});

function scaleOf(inner: HTMLElement): number {
  return Number(inner.style.transform.match(/scale\(([\d.]+)\)/)?.[1]);
}

function translateXOf(inner: HTMLElement): number {
  return Number(inner.style.transform.match(/translate\(([\d.]+)px/)?.[1]);
}

describe('FitScale re-measures the instant ReelUnitsVersion changes', () => {
  it('shrinks once a version bump reveals content that no longer fits — with no resize or children change', () => {
    // A single stable element reference reused across both renders below, so React sees the exact
    // same `children`: only the context value differs, isolating the version signal as the one
    // thing that can explain a re-fit.
    const content = createElement('div');

    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 0 },
        createElement(FitScale, null, content),
      ),
    );

    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    stubBox(wrap, 200, 200);
    stubBox(inner, 100, 100); // fits inside the band as-is

    // Nothing has re-measured against these stubbed boxes yet (no resize, no state change) — the
    // scale is still whatever the pre-stub mount pass computed.
    expect(inner.style.transform).toContain('scale(1)');

    // The player upgrading --ru/--rw is exactly this: content that used to fit now needs more room
    // than the band has. Grow it, then bump the version the way ReelPlayer's applyBoardMetrics does.
    stubBox(inner, 300, 300);
    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 1 },
        createElement(FitScale, null, content),
      ),
    );

    const scale = scaleOf(inner);
    expect(scale).toBeGreaterThan(0);
    expect(scale).toBeLessThan(1);
  });

  it('does not re-fit on a render that leaves the version unchanged', () => {
    const content = createElement('div');
    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 5 },
        createElement(FitScale, null, content),
      ),
    );
    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    stubBox(wrap, 200, 200);
    stubBox(inner, 100, 100);

    // Content silently grows past the band, same as above, but the version this time stays put.
    stubBox(inner, 300, 300);
    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 5 },
        createElement(FitScale, null, content),
      ),
    );

    // No signal fired (same version, same children, ResizeObserver is inert here), so the stale
    // scale from the pre-growth measurement is left standing — proving the version, not React's
    // ordinary re-render, is what drives the re-fit.
    expect(inner.style.transform).toContain('scale(1)');
  });

  it('centers the visible finish instead of invisible descendant overflow', () => {
    const content = createElement('div');
    const { container, rerender } = render(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 0 },
        createElement(FitScale, null, content),
      ),
    );
    const wrap = container.firstElementChild as HTMLElement;
    const inner = wrap.firstElementChild as HTMLElement;
    const root = inner.firstElementChild as HTMLElement;

    stubBox(wrap, 200, 200);
    // The safety extent is 140px because a clipped/decorative descendant reaches farther right,
    // while the visible card itself is 100px wide. The card belongs at x=50, not x=30.
    stubBox(inner, 140, 100);
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 100 });
    Object.defineProperty(root, 'offsetLeft', { configurable: true, value: 0 });

    rerender(
      createElement(
        ReelUnitsVersion.Provider,
        { value: 1 },
        createElement(FitScale, null, content),
      ),
    );

    expect(scaleOf(inner)).toBe(1);
    expect(translateXOf(inner)).toBe(50);
  });
});
