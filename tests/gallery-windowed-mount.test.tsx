import { render, cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GalleryApp } from '../src/gallery/GalleryApp';

// #/gallery lists the whole block library — ~450 real renders. Mounting them all at once janked
// the first paint (one big synchronous commit); every other route mounts in well under it. The fix
// windows the tiles: only ones near the viewport mount the heavy TopicCanvas, the rest stay as
// reserved-height skeletons (`.vlib-render--pending`) until scrolled near, via useInView.
//
// jsdom ships no IntersectionObserver and reports 0×0 rects, so nothing is ever "in view" here —
// which is exactly the off-screen case we want to pin: the tiles must stay skeletons rather than
// mount the whole library. The `?mountall=1` audit hatch must still force every tile to mount, so
// the overflow audit (window.__overflowAudit) can sweep the full set.

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe('gallery windowed mounting', () => {
  const realIO = globalThis.IntersectionObserver;
  afterEach(
    () => {
      globalThis.IntersectionObserver = realIO;
      cleanup();
      window.location.hash = '';
    },
    // the ?mountall=1 case unmounts the whole real block library; the default 10s hook
    // budget flakes under heavy load
    60_000,
  );

  it('keeps off-screen tiles as skeletons instead of mounting the whole library', () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
    const { container } = render(<GalleryApp />);

    const tiles = container.querySelectorAll('.vlib-tile').length;
    const pending = container.querySelectorAll('.vlib-render--pending').length;
    const mounted = container.querySelectorAll('.vlib-render .card').length;

    // The full library is listed…
    expect(tiles).toBeGreaterThan(100);
    // …but virtually none of it is mounted — the windowing is doing its job.
    expect(pending).toBe(tiles);
    expect(mounted).toBe(0);
  });

  it('?mountall=1 forces every tile to mount for the overflow audit', async () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopObserver;
    window.location.hash = '#/gallery?mountall=1';
    const { container } = render(<GalleryApp />);

    const tiles = container.querySelectorAll('.vlib-tile').length;
    // Detail shards and renderers are intentionally lazy. The audit hatch is ready only once every
    // listed tile has settled into its real render; waiting also wraps the async React commits in act.
    await waitFor(
      () => {
        expect(container.querySelectorAll('.vlib-render--pending').length).toBe(0);
        expect(container.querySelectorAll('.vlib-render').length).toBe(tiles);
      },
      { timeout: 60_000 },
    );
  }, 60_000); // mounts the entire real block library; the global 20s budget flakes under heavy load
});
