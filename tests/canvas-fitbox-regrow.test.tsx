import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';

afterEach(cleanup);

// A block shrunk to fit a narrow host has to grow back when the host widens. FitBox lays a
// scaled block out at 100/k% so it fills the host after the transform, and it used to measure
// the block at that width — host ÷ k, which is exactly the overflow that yields k again. Every
// re-measure re-derived the old scale, so a card fitted once in a short window kept that size
// in every larger window after it: the Lens showed a card at 87% on a 1080px-tall screen with
// half the sheet empty.
describe('FitBox grows back', () => {
  it('returns to scale 1 once the host is wide enough again', () => {
    const view = () => (
      <FitBox>
        <div>wide thing</div>
      </FitBox>
    );
    const { container, rerender } = render(view());
    const host = container.querySelector('.fit-box') as HTMLElement;
    const inner = host.firstElementChild as HTMLElement;
    let hostWidth = 100;
    const CONTENT = 200;
    Object.defineProperty(host, 'clientWidth', { get: () => hostWidth, configurable: true });
    // What a browser reports for the inner box: its own laid-out width (the host, stretched by
    // whatever inline width it carries) or the content, whichever is wider.
    Object.defineProperty(inner, 'scrollWidth', {
      get: () => Math.max(CONTENT, (hostWidth * parseFloat(inner.style.width || '100')) / 100),
      configurable: true,
    });
    rerender(view());
    expect(inner.style.transform).toBe('scale(0.5)');
    expect(inner.style.width).toBe('200%');

    hostWidth = 400;
    rerender(view());
    expect(inner.style.transform).toBe('');
    expect(inner.style.width).toBe('');
  });
});
