import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EcgStrip } from '../src/canvas/blocks/charts2/EcgStrip';

// Regression coverage: interval bracket labels only staggered across 2 vertical rows, so a
// 3rd interval landed back on row 0 and collided with the 1st; and abnormality pin labels
// switched anchor at a fixed 60px clearance regardless of the label's own length.

describe('EcgStrip', () => {
  it('staggers 3+ interval labels across at least 3 rows instead of colliding on row 1', () => {
    const { container } = render(
      <EcgStrip
        intervals={[
          { label: 'PR', fromMs: 0, toMs: 160 },
          { label: 'QRS', fromMs: 160, toMs: 240 },
          { label: 'QT', fromMs: 160, toMs: 440 },
        ]}
      />,
    );
    const lbls = Array.from(container.querySelectorAll('text.c2-ecg-iv-lbl'));
    expect(lbls).toHaveLength(3);
    const ys = new Set(lbls.map((n) => n.getAttribute('y')));
    // Three intervals must not collapse onto just 2 distinct y-positions.
    expect(ys.size).toBeGreaterThanOrEqual(3);
  });

  it('gives a long abnormality label enough clearance before flipping anchor', () => {
    const { container } = render(
      <EcgStrip abnormalities={[{ atMs: 900, label: 'ST elevation in anterolateral leads' }]} />,
    );
    const lbl = container.querySelector('text.c2-ecg-pin-lbl');
    expect(lbl).toBeTruthy();
    // A long label near the right edge must anchor 'end' (grows leftward), not 'middle'
    // (which would still bleed past the strip on the right).
    expect(lbl!.getAttribute('text-anchor')).toBe('end');
  });

  it('renders normally with the default synthesized beat (no intervals/abnormalities)', () => {
    const { container } = render(<EcgStrip />);
    expect(container.querySelector('path.c2-ecg-trace')).toBeTruthy();
    expect(container.querySelectorAll('text.c2-ecg-iv-lbl')).toHaveLength(0);
  });
});
