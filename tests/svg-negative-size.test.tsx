import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GradientDescent } from '../src/canvas/blocks/charts2/GradientDescent';

// An SVG rect cannot have a negative width or height — the browser rejects the attribute outright
// and the shape simply never draws, so the block renders "fine" while silently missing its content
// and spraying errors into the console. GradientDescent hit exactly this: it built its cell
// boundaries by taking midpoints of raw DATA values but bracketing them with the plot's PIXEL
// edges, mixing two coordinate systems. With a domain like -2…2 against a 42px left edge, the first
// cell came out ~43px wide in the wrong direction (width="-43.165").
//
// The fix has to survive both traps, so this pins both: a small-magnitude domain (which is what
// made data-vs-pixel confusion produce a negative), and the inverted y axis (screen y grows
// downward, so rows descend in pixels — a naive subtraction goes negative there too).

/** A loss surface over a small-magnitude domain, the shape that exposed the bug. */
function contourGrid(): { x: number; y: number; z: number }[][] {
  const xs = [-2, -1, 0, 1, 2];
  const ys = [-2, -1, 0, 1, 2];
  return ys.map((y) => xs.map((x) => ({ x, y, z: x * x + 3 * y * y })));
}

function sizesOf(container: HTMLElement): { w: number; h: number }[] {
  return [...container.querySelectorAll('rect')].map((r) => ({
    w: parseFloat(r.getAttribute('width') ?? '0'),
    h: parseFloat(r.getAttribute('height') ?? '0'),
  }));
}

describe('GradientDescent — every cell is a drawable rect', () => {
  it('never emits a negative width or height', () => {
    const { container } = render(
      <GradientDescent
        title="Loss surface"
        contour={contourGrid()}
        path={[
          { step: 0, x: -1.8, y: 1.6 },
          { step: 1, x: -0.6, y: 0.4 },
          { step: 2, x: 0, y: 0 },
        ]}
        learningRate={0.1}
      />,
    );
    const sizes = sizesOf(container);
    expect(sizes.length).toBeGreaterThan(0);
    const negative = sizes.filter((s) => s.w < 0 || s.h < 0);
    expect(negative, `rects with a negative size: ${JSON.stringify(negative)}`).toEqual([]);
    cleanup();
  });

  it('tiles the plot — the cells span a real area, not a collapsed one', () => {
    const { container } = render(
      <GradientDescent
        title="Loss surface"
        contour={contourGrid()}
        path={[{ step: 0, x: -1.8, y: 1.6 }]}
        learningRate={0.1}
      />,
    );
    // 5x5 samples → 25 cells, each with real extent. A degenerate build would collapse them to ~0.
    const cells = sizesOf(container).filter((s) => s.w > 1 && s.h > 1);
    expect(cells.length).toBeGreaterThanOrEqual(25);
    cleanup();
  });
});
