import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DimensionDrawing } from '../src/canvas/blocks/media/DimensionDrawing';
import type { DimensionLine } from '../src/canvas/blocks/media/types';

// Regression coverage: dimension label text had no width constraint and was positioned with a
// fixed growth direction (centred for horizontal spans, growing right for vertical spans), so
// a longer callout near the viewBox edge ran past the boundary. The demo only ever used short
// numeric labels like "60"; a real custom callout can be much longer.

const outline = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 60 },
  { x: 0, y: 60 },
];

describe('DimensionDrawing', () => {
  it('flips a long vertical dimension label to grow left when it would overflow the right edge', () => {
    const dimensions: DimensionLine[] = [
      { from: [100, 0], to: [100, 60], label: 'Overall part height measurement' },
    ];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    expect(text!.getAttribute('text-anchor')).toBe('end');
  });

  it('leaves a short label at its default position', () => {
    const dimensions: DimensionLine[] = [{ from: [0, 0], to: [100, 0], label: '60' }];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    expect(text!.textContent).toBe('60');
    expect(text!.getAttribute('text-anchor')).toBe('middle');
  });

  it('clamps a long horizontal dimension label to stay within the viewBox width', () => {
    const dimensions: DimensionLine[] = [
      { from: [0, 0], to: [100, 0], label: 'A very long custom dimension callout string' },
    ];
    const { container } = render(<DimensionDrawing outline={outline} dimensions={dimensions} />);
    const text = container.querySelector('text.dim-text');
    expect(text).toBeTruthy();
    const x = Number(text!.getAttribute('x'));
    const halfW = (text!.textContent!.length * 3) / 2;
    expect(x - halfW).toBeGreaterThanOrEqual(0);
    expect(x + halfW).toBeLessThanOrEqual(200); // VB_W
  });
});
