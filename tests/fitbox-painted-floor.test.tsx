import type { ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';

afterEach(cleanup);

// The floor is a promise about type as it PAINTS. Two kinds of text slipped past a walk that read
// only childless elements in CSS px: words sitting beside an element (`label <b>bold</b>`), and
// SVG text, whose font-size is in user units that the chart's own scale multiplies.
describe('FitBox — the floor is measured on the type as it paints', () => {
  const geometry = (el: Element, values: Record<string, number>) => {
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(el, key, { configurable: true, get: () => value });
    }
  };
  function mount(block: () => ReactNode, prepare?: (root: HTMLElement) => void) {
    const tree = () => (
      <div className="box" style={{ overflowY: 'auto', maxHeight: '400px' }}>
        <FitBox fitHeight>{block()}</FitBox>
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
    return inner;
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('counts words set beside an element, not only in childless ones', async () => {
    // 800 into 400 wants 0.5. The 10px label's own words are the smallest type: 9/10 = 0.9.
    const inner = mount(() => (
      <p style={{ fontSize: '10px' }}>
        a label with its own words <b style={{ fontSize: '20px' }}>and a bold part</b>
      </p>
    ));
    await settle();
    expect(inner.style.transform).toMatch(/scale\(0\.9\)/);
  });

  it('reads SVG text at the size its chart draws it, and never fits it under 9px', async () => {
    // 16 user units in a chart drawn at half size paint at 8px — already under the floor, so a
    // fit that would take the block to 0.5 leaves it at its own size instead.
    const inner = mount(
      () => (
        <svg viewBox="0 0 800 400">
          <text style={{ fontSize: '16px' }}>axis label</text>
        </svg>
      ),
      (root) => {
        const text = root.querySelector('text') as SVGTextElement;
        Object.defineProperty(text, 'getScreenCTM', {
          configurable: true,
          value: () => ({ a: 0.5, b: 0 }) as DOMMatrix,
        });
      },
    );
    await settle();
    expect(inner.style.transform).toBe('');
  });

  it('sets no floor from text nobody can see', async () => {
    // A faded 6px label would pin the block at 1.5 → 1; unseen, the 20px body decides: 0.5.
    const inner = mount(
      () => (
        <div style={{ fontSize: '20px' }}>
          the body of the block
          <span className="faded" style={{ fontSize: '6px' }}>
            a faded label
          </span>
        </div>
      ),
      (root) => {
        const faded = root.querySelector('.faded') as HTMLElement;
        Object.defineProperty(faded, 'checkVisibility', { configurable: true, value: () => false });
      },
    );
    await settle();
    expect(inner.style.transform).toMatch(/scale\(0\.5\)/);
  });
});
