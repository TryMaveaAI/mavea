import { act, render, cleanup, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GalleryApp } from '../src/gallery/GalleryApp';

// #/gallery lists the whole block library — ~450 real renders. Mounting them all at once janked
// the first paint (one big synchronous commit); every other route mounts in well under it. The fix
// windows the tiles: only ones near the viewport mount the heavy TopicCanvas, the rest stay as
// reserved-height skeletons (`.vlib-render--pending`) until scrolled near, via useInView.
//
// jsdom ships no IntersectionObserver and reports 0×0 rects, so nothing is ever "in view" here —
// which is exactly the off-screen case we want to pin: the tiles must stay skeletons rather than
// mount the whole library. The audit combines `?mountall=1` with a family query: it still forces
// every tile in that family to mount, while the runner visits all families sequentially instead of
// asking an 8 GB machine to hold all 625 TopicCanvas trees at once.

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

class ControlledObserver implements IntersectionObserver {
  static instances: ControlledObserver[] = [];
  private target: Element | null = null;
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin = '0px';
  readonly thresholds: readonly number[];

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? '0px';
    const threshold = options?.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
    ControlledObserver.instances.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  trigger(isIntersecting: boolean) {
    if (!this.target) throw new Error('observer has no target');
    this.callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry], this);
  }
}

describe('gallery windowed mounting', () => {
  const realIO = globalThis.IntersectionObserver;
  afterEach(
    () => {
      globalThis.IntersectionObserver = realIO;
      ControlledObserver.instances = [];
      cleanup();
      window.location.hash = '';
    },
    // the ?mountall=1 case unmounts the whole real block library; the default 10s hook
    // budget flakes under heavy load
    60_000,
  );

  it('commits one family first, then keeps off-screen tiles as skeletons', () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
    const realIdle = window.requestIdleCallback;
    const realCancelIdle = window.cancelIdleCallback;
    let finishIdle: (() => void) | undefined;
    window.requestIdleCallback = ((callback: IdleRequestCallback) => {
      finishIdle = () => callback({ didTimeout: false, timeRemaining: () => 10 });
      return 1;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = () => {};

    try {
      const { container } = render(<GalleryApp />);

      const firstTiles = container.querySelectorAll('.vlib-tile').length;
      expect(firstTiles).toBe(8);
      expect(firstTiles).toBeLessThan(625);

      act(() => finishIdle?.());
      const tiles = container.querySelectorAll('.vlib-tile').length;
      const pending = container.querySelectorAll('.vlib-render--pending').length;
      const mounted = container.querySelectorAll('.vlib-render .card').length;

      expect(tiles).toBe(625);
      // The full library is listed after the idle beat, but none of its heavy canvases mounted.
      expect(pending).toBe(tiles);
      expect(mounted).toBe(0);
    } finally {
      window.requestIdleCallback = realIdle;
      window.cancelIdleCallback = realCancelIdle;
    }
  });

  it('?mountall=1 forces every filtered-family tile to mount for the overflow audit', async () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
    window.location.hash = '#/gallery?mountall=1&family=tables';
    const { container } = render(<GalleryApp />);

    const tiles = container.querySelectorAll('.vlib-tile').length;
    expect(tiles).toBeGreaterThan(1);
    expect(tiles).toBeLessThan(625);
    // Detail shards and renderers are intentionally lazy. The audit hatch is ready only once every
    // listed tile has settled into its real render; waiting also wraps the async React commits in act.
    await waitFor(
      () => {
        expect(container.querySelectorAll('.vlib-render--pending').length).toBe(0);
        expect(container.querySelectorAll('.vlib-render').length).toBe(tiles);
      },
      { timeout: 60_000 },
    );
  }, 60_000);

  it('preloads against the gallery scroller and preserves measured height while unmounted', async () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = ControlledObserver;
    const realRect = HTMLElement.prototype.getBoundingClientRect;
    const realComputedStyle = window.getComputedStyle;
    window.getComputedStyle = ((element: Element) =>
      element.classList.contains('vlib')
        ? ({ overflowY: 'auto' } as CSSStyleDeclaration)
        : realComputedStyle(element)) as typeof window.getComputedStyle;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('vlib-render')) {
        return {
          top: 0,
          bottom: 420,
          left: 0,
          right: 400,
          width: 400,
          height: 420,
          x: 0,
          y: 0,
          toJSON() {},
        } as DOMRect;
      }
      return realRect.call(this);
    };

    try {
      const { container } = render(<GalleryApp />);
      const gallery = container.querySelector('.vlib');
      const first = ControlledObserver.instances[0];
      expect(first?.options?.root).toBe(gallery);

      act(() => first?.trigger(true));
      const firstTile = container.querySelector('.vlib-tile');
      await waitFor(() => expect(firstTile?.querySelector('.card')).toBeTruthy(), {
        timeout: 10_000,
      });

      act(() => first?.trigger(false));
      await waitFor(
        () => {
          const pending = firstTile?.querySelector<HTMLElement>('.vlib-render--pending');
          expect(pending).toBeTruthy();
          expect(pending?.style.minHeight).toBe('420px');
        },
        { timeout: 10_000 },
      );

      act(() => first?.trigger(true));
      await waitFor(() => expect(firstTile?.querySelector('.card')).toBeTruthy(), {
        timeout: 10_000,
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = realRect;
      window.getComputedStyle = realComputedStyle;
    }
  });

  it('exposes fixture density as one accessible radio choice', () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
    const { getByRole } = render(<GalleryApp />);
    const density = getByRole('radiogroup', { name: 'Fixture density' });
    const densityChoices = within(density).getAllByRole('radio');
    expect(densityChoices).toHaveLength(3);
    expect(
      densityChoices.filter((choice) => choice.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);

    const families = getByRole('radiogroup', { name: 'Filter by family' });
    expect(
      within(families)
        .getAllByRole('radio')
        .filter((choice) => choice.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });
});
