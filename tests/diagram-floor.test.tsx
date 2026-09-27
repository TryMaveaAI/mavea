import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FitBox } from '../src/canvas/layout/FitBox';
import { diagramLabelPx, holdDiagrams, releaseDiagrams } from '../src/canvas/layout/diagramFloor';

afterEach(cleanup);

// A diagram drawn in viewBox units paints its labels at whatever its box gives it, so a stage
// narrower than the board's card drew a causation chain at 0.92x of the board under a readout of
// 150%, and at 3.9px on a phone. jsdom has no layout, so each diagram reports the geometry a
// browser would: `unit` is the painted px one user unit comes to.
const geometry = (el: Element, values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(el, key, { configurable: true, value, writable: true });
  }
};

function drawn(svg: SVGSVGElement, unit: number, w = 280, h = 120) {
  geometry(svg, {
    clientWidth: w,
    clientHeight: h,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: w, height: h }) as DOMRect,
  });
  for (const label of svg.querySelectorAll('text')) {
    geometry(label, { getScreenCTM: () => ({ a: unit, b: 0, c: 0, d: unit }) });
  }
}

function card(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="card">
      <div class="card-eyebrow">Funnel mechanics</div>
      <div class="wrap" style="overflow: hidden; max-height: 200px">
        <svg viewBox="0 0 720 300"><text style="font-size: 10px">Causes</text></svg>
      </div>
      <svg class="ic" viewBox="0 0 24 24"><path d="M0 0h24"></path></svg>
    </div>`;
  document.body.append(root);
  return root;
}
const parts = (root: HTMLElement) => ({
  svg: root.querySelector('svg:not(.ic)') as SVGSVGElement,
  wrap: root.querySelector('.wrap') as HTMLElement,
});

describe('a diagram held at the size a reader saw it', () => {
  it('reads each labelled diagram by its smallest painted label, and skips icons', () => {
    const root = card();
    drawn(parts(root).svg, 1.09);
    expect(diagramLabelPx(root)).toEqual([10.9]);
  });

  it('keeps a legible width and pans the rest, and gives the box back on release', () => {
    const root = card();
    const { svg, wrap } = parts(root);
    // A phone-width stage: 10 units at 0.39 paints 3.9px.
    drawn(svg, 0.39);
    holdDiagrams(root, [9.1]);
    // Grown by 9.1 / 3.9 in both axes, so the geometry stays proportional.
    expect(svg.style.minWidth).toBe('654px');
    expect(svg.style.minHeight).toBe('280px');
    expect(wrap.style.overflowX).toBe('auto');
    expect(wrap.style.maxHeight).toBe('none');
    expect(wrap.getAttribute('role')).toBe('region');
    expect(wrap.tabIndex).toBe(0);
    expect(wrap.getAttribute('aria-label')).toBe('Scrollable content: Funnel mechanics');
    expect(wrap.classList.contains('canvas-hscroll')).toBe(true);

    releaseDiagrams(root);
    expect(svg.style.minWidth).toBe('');
    expect(svg.hasAttribute('data-legibility-guard')).toBe(false);
    expect(wrap.style.overflow).toBe('hidden');
    expect(wrap.style.maxHeight).toBe('200px');
    expect(wrap.hasAttribute('role')).toBe(false);
    expect(wrap.hasAttribute('tabindex')).toBe(false);
    expect(wrap.classList.contains('canvas-hscroll')).toBe(false);
  });

  it('holds the size the board drew it at, not just the 9px floor', () => {
    const root = card();
    const { svg } = parts(root);
    // 9.5px clears the floor, but the board drew it at 10.9.
    drawn(svg, 0.95);
    holdDiagrams(root, [10.9]);
    expect(svg.style.minWidth).toBe(`${Math.ceil((280 * 10.9) / 9.5)}px`);
    // At the board's size already, nothing is held.
    drawn(svg, 1.1);
    holdDiagrams(root, [10.9]);
    expect(svg.style.minWidth).toBe('');
  });

  it('holds the floor with no board size to go on', () => {
    const root = card();
    const { svg } = parts(root);
    drawn(svg, 0.55);
    holdDiagrams(root);
    expect(svg.style.minWidth).toBe(`${Math.ceil((280 * 9.1) / 5.5)}px`);
  });
});

describe('FitBox — a held diagram', () => {
  it('holds it after the fit, and fits the block without counting the held width', () => {
    const tree = () => (
      <FitBox diagramFloorPx={[9.1]}>
        <div className="card">
          <svg viewBox="0 0 720 300">
            <text style={{ fontSize: 10 }}>Causes</text>
          </svg>
        </div>
      </FitBox>
    );
    const { container, rerender } = render(tree());
    const host = container.querySelector('.fit-box') as HTMLElement;
    const inner = host.firstElementChild as HTMLElement;
    const svg = container.querySelector('svg') as SVGSVGElement;
    drawn(svg, 0.39);
    geometry(host, { clientWidth: 400, offsetWidth: 400 });
    // The block is as wide as its host, unless the held width is counted.
    Object.defineProperty(inner, 'scrollWidth', {
      configurable: true,
      get: () => (svg.style.minWidth ? 654 : 400),
    });
    rerender(tree());
    expect(svg.style.minWidth).toBe('654px');
    // The next fit is read with the diagram held: it must still see a block as wide as its host.
    rerender(tree());
    expect(inner.style.transform).toBe('');
    expect(svg.style.minWidth).toBe('654px');
  });
});
