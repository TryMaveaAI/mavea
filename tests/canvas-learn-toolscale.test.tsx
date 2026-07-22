import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ToolScale } from '../src/canvas/blocks/learn/ToolScale';

// Regression coverage for a real bug: the protractor's viewBox height was a bare 150, only 22px
// below the semicircle's flat baseline (cy = 128) — comfortable for today's fixed geometry, but
// with zero real margin for any bottom content (a tick label's descender, a future below-axis
// caption). Assert every rendered coordinate — across the full value/max domain, not just the
// demo fixture — stays safely inside the viewBox instead of nudging past its bottom edge.

function svgNumbers(container: HTMLElement, selector: string) {
  const svg = container.querySelector<SVGSVGElement>(selector)!;
  const [, , , vbH] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(' ').map(Number);
  const ys: number[] = [];
  svg.querySelectorAll('[y1]').forEach((el) => {
    ys.push(Number(el.getAttribute('y1')), Number(el.getAttribute('y2')));
  });
  svg.querySelectorAll('text').forEach((el) => ys.push(Number(el.getAttribute('y'))));
  svg.querySelectorAll('circle').forEach((el) => {
    ys.push(Number(el.getAttribute('cy')) + Number(el.getAttribute('r')));
  });
  return { vbH, maxY: Math.max(...ys) };
}

describe('ToolScale protractor', () => {
  it.each([0, 45, 90, 135, 180])(
    'keeps every drawn coordinate inside the viewBox at value=%i',
    (value) => {
      const { container } = render(
        <ToolScale title="Angle" instrument="protractor" value={value} max={180} unit="°" />,
      );
      const { vbH, maxY } = svgNumbers(container, 'svg.lr-ts-svg');
      // Real legroom below the deepest coordinate — not a viewBox sized flush against today's
      // content, which is exactly what let a bare-150 viewBox reclip the instant any bottom
      // content (a tick label descender, a future below-axis caption) nudged a few px lower.
      expect(vbH - maxY).toBeGreaterThanOrEqual(20);
    },
  );

  it('still fits when max is unusually large or the value overshoots it', () => {
    for (const [value, max] of [
      [45, 360],
      [400, 180],
      [-20, 180],
    ] as const) {
      const { container } = render(
        <ToolScale title="Angle" instrument="protractor" value={value} max={max} unit="°" />,
      );
      const { vbH, maxY } = svgNumbers(container, 'svg.lr-ts-svg');
      expect(vbH - maxY).toBeGreaterThanOrEqual(20);
    }
  });
});
