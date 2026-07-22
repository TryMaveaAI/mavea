import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WaveDiagram } from '../src/canvas/blocks/learn/WaveDiagram';

// Regression coverage for a real bug: per-wave legend labels were rendered right-anchored at a
// fixed x position (the plot's right edge) with no cap on the source string's length. The demo
// fixture's short labels ("440 Hz") never exposed it, but a longer label — e.g. a descriptive
// name a model might supply — ran leftward past the plot's left padding and off the card.

describe('WaveDiagram', () => {
  it('truncates a long per-wave legend label instead of letting it overflow the plot', () => {
    const longLabel = 'Fundamental frequency of the driven oscillator (440 Hz reference)';
    const { container } = render(
      <WaveDiagram title="Waves" waves={[{ amplitude: 1, wavelength: 2, label: longLabel }]} />,
    );
    const labelNode = container.querySelector('.wv-curve-lbl');
    expect(labelNode).toBeTruthy();
    const text = labelNode!.textContent ?? '';
    // Well short of the full string, and ends with the truncation ellipsis.
    expect(text.length).toBeLessThan(longLabel.length);
    expect(text.endsWith('…')).toBe(true);
  });

  it('leaves a short legend label untouched', () => {
    const { container } = render(
      <WaveDiagram title="Waves" waves={[{ amplitude: 1, wavelength: 2, label: '440 Hz' }]} />,
    );
    const labelNode = container.querySelector('.wv-curve-lbl');
    expect(labelNode?.textContent).toBe('440 Hz');
  });

  it('caps every wave label so its right-anchored end never runs past the plot padding', () => {
    // Two waves, both with labels long enough that the old unbounded render would push their
    // start position well left of the axis — every rendered label must stay within budget.
    const { container } = render(
      <WaveDiagram
        title="Waves"
        waves={[
          { amplitude: 1, wavelength: 2, label: 'A very long descriptive label for wave one' },
          {
            amplitude: 0.6,
            wavelength: 3,
            phase: 1,
            label: 'An equally verbose label for wave two here',
          },
        ]}
      />,
    );
    const labels = Array.from(container.querySelectorAll('.wv-curve-lbl'));
    expect(labels).toHaveLength(2);
    for (const node of labels) {
      // 20-char budget (incl. the ellipsis) at the class's ~9.5px font comfortably clears the
      // plot's left padding before reaching the fixed right-anchor x used for every label.
      expect((node.textContent ?? '').length).toBeLessThanOrEqual(20);
    }
  });
});
