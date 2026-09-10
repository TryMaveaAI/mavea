import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';

// FitBox is the opt-in "always fits its card" backstop for heavy blocks. These tests lock
// the two contracts that matter regardless of environment:
//   1. It is transparent — children always render, so wrapping a block in it can never hide
//      content (the same safety BlockBoundary gives for throws).
//   2. It degrades cleanly where measurement is unavailable (jsdom / SSR has no real layout
//      and no ResizeObserver), staying at scale 1 rather than collapsing the block.
// The actual downscale-when-too-wide behaviour is a real-layout concern and is covered by the
// gallery overflow audit, not here — jsdom reports scrollWidth 0 so nothing to measure.

afterEach(cleanup);

describe('FitBox', () => {
  it('renders its children transparently', () => {
    const { getByText } = render(
      <FitBox>
        <div>fit me</div>
      </FitBox>,
    );
    expect(getByText('fit me')).toBeInTheDocument();
  });

  it('stays at scale 1 (no transform) when nothing needs shrinking', () => {
    const { container } = render(
      <FitBox>
        <p>short</p>
      </FitBox>,
    );
    // The inner wrapper carries the transform only when scaled; in jsdom it should not.
    const inner = container.querySelector('.fit-box > div') as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.style.transform).toBe('');
  });

  it('sets content-visibility so off-screen blocks skip layout on weak hardware', () => {
    const { container } = render(
      <FitBox>
        <div>x</div>
      </FitBox>,
    );
    const host = container.querySelector('.fit-box') as HTMLElement;
    expect(host.style.contentVisibility).toBe('auto');
  });

  it('does not leave a ResizeObserver observing after unmount', () => {
    const observed = new Set<Element>();
    const RealRO = globalThis.ResizeObserver;
    class SpyRO {
      observe(el: Element) {
        observed.add(el);
      }
      unobserve(el: Element) {
        observed.delete(el);
      }
      disconnect() {
        observed.clear();
      }
    }
    vi.stubGlobal('ResizeObserver', SpyRO as unknown as typeof ResizeObserver);
    const { unmount } = render(
      <FitBox>
        <div>x</div>
      </FitBox>,
    );
    unmount();
    expect(observed.size).toBe(0);
    vi.stubGlobal('ResizeObserver', RealRO);
  });
});

// The height fit: a block taller than its bounded host is scaled down until it fits, and never
// past the point where its smallest type would paint under the 9px floor. jsdom has no layout,
// so the box, the content and the type sizes are stated on the elements directly.
describe('FitBox — fitting a bounded box’s height', () => {
  const geometry = (el: Element, values: Record<string, number>) => {
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(el, key, { configurable: true, get: () => value });
    }
  };
  function mount(contentH: number, boxH: number, fontPx: number) {
    const tree = () => (
      <div className="box" style={{ overflowY: 'auto', maxHeight: `${boxH}px` }}>
        <FitBox fitHeight>
          <p style={{ fontSize: `${fontPx}px` }}>tall block</p>
        </FitBox>
      </div>
    );
    const { container, rerender } = render(tree());
    const box = container.querySelector('.box') as HTMLElement;
    const host = container.querySelector('.fit-box') as HTMLElement;
    const inner = host.firstElementChild as HTMLElement;
    geometry(box, { clientHeight: boxH, scrollHeight: contentH, scrollTop: 0 });
    geometry(host, { clientWidth: 400, offsetWidth: 400 });
    geometry(inner, { scrollWidth: 400, scrollHeight: contentH });
    host.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 400, height: contentH }) as DOMRect;
    box.getBoundingClientRect = () => ({ top: 0, left: 0, width: 400, height: boxH }) as DOMRect;
    // The mount measured before the geometry above existed; a fresh children reference re-runs
    // the measure the way the shared resize observer would in a browser.
    rerender(tree());
    return { container, inner };
  }
  it('scales a tall block down to its box', async () => {
    // 20px type at 0.5 is 10px, above the floor, so the fit is free to reach the box.
    const { inner } = mount(800, 400, 20);
    await new Promise((r) => setTimeout(r, 0));
    expect(inner.style.transform).toMatch(/scale\(0\.5\)/);
    expect(inner.style.marginBottom).toMatch(/^-400(\.0)?px$/);
  });
  it('stops at the legibility floor and leaves the rest to the host', async () => {
    // 800 into 400 wants 0.5, but 12px type at 0.5 is 6px: the fit stops at 9/12 = 0.75.
    const { inner } = mount(800, 400, 12);
    await new Promise((r) => setTimeout(r, 0));
    expect(inner.style.transform).toMatch(/scale\(0\.75\)/);
  });
  it('leaves a block that fits untouched', async () => {
    const { inner } = mount(300, 400, 12);
    await new Promise((r) => setTimeout(r, 0));
    expect(inner.style.transform).toBe('');
  });
});
