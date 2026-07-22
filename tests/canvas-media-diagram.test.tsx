import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Diagram } from '../src/canvas/blocks/media/Diagram';
import type { DiagLabel } from '../src/canvas/blocks/media/types';

// Regression coverage: the viewBox is grown to fit every label's estimated text width so a
// callout can never clip against the card's overflow:hidden — but the estimate used a flat
// 1.9-per-glyph multiplier tuned for a short one-word tag, which underestimates a longer,
// sentence-like label. A longer label now gets a wider per-glyph estimate.

function svgOf(container: HTMLElement) {
  return container.querySelector('svg.med-diag-svg') as SVGSVGElement;
}

describe('Diagram', () => {
  it('grows the viewBox further for a long label than the old flat estimate would', () => {
    const longText = 'x'.repeat(25); // > 20 chars, hits the widened per-glyph tier
    const labels: DiagLabel[] = [{ x: 50, y: 50, text: longText, side: 'right' }];
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={labels} />);
    const vb = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW] = vb;
    // Old flat-1.9 estimate would have produced x1 = 50 + 7 + 25*1.9 + 1 = 105.5; the new
    // length-tiered estimate (2.1/char past 20 chars) must exceed that.
    expect(vbW).toBeGreaterThan(105.5);
  });

  it('keeps a short label at the original, tighter estimate', () => {
    // x=90 pushes the estimated extent past the default 100-wide figure box, so the viewBox
    // reflects the label estimate itself rather than being floored at the default width.
    const labels: DiagLabel[] = [{ x: 90, y: 50, text: 'short', side: 'right' }];
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={labels} />);
    const vb = svgOf(container).getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW] = vb;
    // 90 + 7 + 5*1.9 + 1 = 107.5
    expect(vbW).toBeCloseTo(107.5, 1);
  });

  it('renders with no labels at all', () => {
    const { container } = render(<Diagram title="Fig" shapes={[]} labels={[]} />);
    expect(svgOf(container)).toBeTruthy();
  });
});
