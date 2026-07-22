import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PolarPlot } from '../src/canvas/blocks/learn/PolarPlot';
import type { PolarCurve } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: curve labels were drawn as raw SVG <text> pinned to each
// curve's LAST plotted point (t = tMax). The demo fixtures only ever use a single curve, so this
// never showed — but any multi-curve plot shares one domain by construction (that's the whole
// point of overlaying curves), which means every curve terminates at the same angle and its
// label lands on or near the same ray from centre. With 2+ labelled curves over a shared domain,
// several labels rendered fully stacked on the exact same coordinate — illegible. The fix moves
// labels into an HTML legend below the plot (mirroring VectorField's `.vfl-legend`/`.vfl-leg`),
// which can never collide regardless of curve count, domain, or label length.

function roseCurves(n: number): PolarCurve[] {
  // Distinct-looking curves that nonetheless all close over the same [0, 2π] domain — the exact
  // shape that made every label but the first collapse onto one point.
  const fns = ['2 + cos(t)', '1 + sin(t)', 'cos(2*t)', '1', '3*sin(3*t)', '1.5 + cos(4*t)'];
  return Array.from({ length: n }, (_, i) => ({
    fn: fns[i % fns.length],
    label: `Curve ${i + 1} of the overlay set`,
    color: 'var(--presence)',
  }));
}

describe('PolarPlot', () => {
  it.each([2, 4, 6])(
    'gives %i overlaid curves distinct, non-overlapping labels instead of stacking them',
    (n) => {
      const { container } = render(
        <PolarPlot title="Overlay" curves={roseCurves(n)} domain={[0, 2 * Math.PI]} />,
      );

      // No inline SVG text may carry a curve label — that's the collision-prone approach.
      const svgTexts = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
      for (const label of roseCurves(n).map((c) => c.label)) {
        expect(svgTexts).not.toContain(label);
      }

      // Every curve gets exactly one legend row, each at a distinct DOM node (so it can never
      // literally render as the same overlapping element), and every label reads intact.
      const legendItems = Array.from(container.querySelectorAll('.vfl-leg'));
      expect(legendItems).toHaveLength(n);
      const legendTexts = legendItems.map((el) => el.textContent);
      expect(new Set(legendTexts).size).toBe(n);
      roseCurves(n).forEach((c, i) => {
        expect(legendTexts[i]).toBe(c.label);
      });
    },
  );

  it('keeps a long label fully readable via wrap instead of letting it run past the card', () => {
    const longLabel =
      'A very long descriptive curve label that is far wider than the 300px plot viewBox';
    const { container } = render(
      <PolarPlot
        title="Long label"
        curves={[{ fn: '2 + cos(t)', label: longLabel, color: 'var(--presence)' }]}
      />,
    );
    const legend = container.querySelector('.vfl-legend');
    expect(legend).toBeTruthy();
    // flex-wrap on the legend container, not nowrap, is what keeps a long label from being
    // clipped or bleeding out — assert the wrapping class is present rather than a computed
    // style (jsdom doesn't apply the stylesheet), and that the full text survives untruncated.
    expect(container.querySelector('.vfl-leg')?.textContent).toBe(longLabel);
  });

  it('renders no legend at all when no curve carries a label', () => {
    const { container } = render(
      <PolarPlot title="Unlabelled" curves={[{ fn: 'cos(3*t)' }, { fn: '1 + sin(t)' }]} />,
    );
    expect(container.querySelector('.vfl-legend')).toBeNull();
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('still plots every curve polyline when several share a domain', () => {
    const { container } = render(
      <PolarPlot title="Overlay" curves={roseCurves(5)} domain={[0, 2 * Math.PI]} />,
    );
    const polylines = Array.from(container.querySelectorAll('polyline'));
    expect(polylines).toHaveLength(5);
    for (const p of polylines) {
      expect(p.getAttribute('points')?.length).toBeGreaterThan(0);
    }
  });
});
