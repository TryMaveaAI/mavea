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
