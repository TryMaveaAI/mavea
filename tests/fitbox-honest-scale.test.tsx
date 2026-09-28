import type { ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FitBox, type FitBoxProps } from '../src/canvas/layout/FitBox';

afterEach(cleanup);

// The Lens states the scale a card is shown at, and that number has to be the truth: one FitBox
// answers for the card (any nested inside the block stands down), a magnification holds the fit
// at 1 so `zoom` is the whole scale, and the fit never takes a card below the size the board
// already showed it at. jsdom has no layout, so each box reports the geometry a browser would.
const geometry = (el: Element, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(el, key, { configurable: true, get: () => value });
  }
};
const settle = () => new Promise((r) => setTimeout(r, 0));
const scaleOf = (el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1);

/** A block 800 tall with 20px type, in a box that leaves it 400: a free fit would be 0.5. */
function stage(
  props: Partial<FitBoxProps>,
  block: () => ReactNode = () => <p style={{ fontSize: 20 }}>x y</p>,
  prepare?: (root: HTMLElement) => void,
) {
  const tree = () => (
    <div className="box" style={{ overflowY: 'auto', maxHeight: '400px' }}>
      <FitBox fitHeight {...props}>
        {block()}
      </FitBox>
    </div>
  );
  const { container, rerender } = render(tree());
  const box = container.querySelector('.box') as HTMLElement;
  const host = container.querySelector('.fit-box') as HTMLElement;
  const inner = host.firstElementChild as HTMLElement;
  geometry(box, { clientHeight: 400, scrollHeight: 800, scrollTop: 0 });
  geometry(host, { clientWidth: 400, offsetWidth: 400 });
  geometry(inner, { scrollWidth: 400, scrollHeight: 800 });
  host.getBoundingClientRect = () => ({ top: 0, left: 0, width: 400, height: 800 }) as DOMRect;
  box.getBoundingClientRect = () => ({ top: 0, left: 0, width: 400, height: 400 }) as DOMRect;
  prepare?.(container);
  // The mount measured before the geometry above existed; a fresh render re-runs the measure
  // the way the shared resize observer would in a browser.
  rerender(tree());
  return { container, inner };
}

describe('FitBox — a scale a host can state', () => {
  it('never fits a block below the size it was seen at, and says it still spills', async () => {
    const onScale = vi.fn();
    const { inner } = stage({ minScale: 0.8, onScale });
    await settle();
    expect(scaleOf(inner)).toBe(0.8);
    expect(onScale).toHaveBeenLastCalledWith(0.8, { legibleMin: 0.45, spills: true });
  });

  it('reports where the smallest type reaches the floor, and no spill once it fits', async () => {
    const onScale = vi.fn();
    const { inner } = stage({ onScale });
    await settle();
    expect(scaleOf(inner)).toBe(0.5);
    // 20px type reaches 9px at 0.45.
    expect(onScale).toHaveBeenLastCalledWith(0.5, { legibleMin: 0.45, spills: false });
  });

  it('holds the block at its own size while the host magnifies it', async () => {
    const { inner } = stage({ hold: true });
    await settle();
    expect(inner.style.transform).toBe('');
  });

  it('stands a nested FitBox down, so two fits never compound', async () => {
    // The nested box holds a 400-wide drawing in 200: alone, it shrinks it to 0.5.
    const nested = () => (
      <FitBox>
        <svg className="drawing" />
      </FitBox>
    );
    let inner: HTMLElement | null = null;
    const prepare = (root: HTMLElement) => {
      const host = root.querySelector('.fit-box .fit-box') as HTMLElement;
      inner = host.firstElementChild as HTMLElement;
      geometry(host, { clientWidth: 200, offsetWidth: 200 });
      geometry(inner, { scrollWidth: 400, scrollHeight: 100 });
    };
    stage({}, nested, prepare);
    await settle();
    expect(inner!.style.transform).toMatch(/scale\(0\.5\)/);

    cleanup();
    stage({ governs: true }, nested, prepare);
    await settle();
    expect(inner!.style.transform).toBe('');
  });
});
