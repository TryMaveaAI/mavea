import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PayoffDiagram } from '../src/canvas/blocks/charts2/PayoffDiagram';
import type { OptionLeg } from '../src/canvas/blocks/charts2/types';

// Regression coverage: breakeven labels were always drawn at a fixed offset above the zero
// line, so a strategy with two breakevens close together on screen (a narrow butterfly/spread
// viewed over a wide price axis) printed both labels on top of each other.

// A narrow long butterfly (strikes 490/500/510) plotted over a wide 0-1000 price axis puts
// its two breakevens only a few price units apart — a small fraction of the visible width.
const butterfly: OptionLeg[] = [
  { type: 'call', position: 'long', strike: 490, premium: 8 },
  { type: 'call', position: 'short', strike: 500, premium: 4, qty: 2 },
  { type: 'call', position: 'long', strike: 510, premium: 1 },
];

describe('PayoffDiagram', () => {
  it('staggers two close breakeven labels instead of stacking them', () => {
    const { container } = render(
      <PayoffDiagram title="Butterfly" legs={butterfly} priceMin={0} priceMax={1000} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pay-be-lbl'));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    const ys = new Set(labels.map((n) => n.getAttribute('y')));
    // Two breakevens landing within 44px of each other must not share the same label y.
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });

  it('leaves a single breakeven at its default position', () => {
    const single: OptionLeg[] = [{ type: 'call', position: 'long', strike: 100, premium: 5 }];
    const { container } = render(
      <PayoffDiagram title="Long call" legs={single} priceMin={80} priceMax={120} />,
    );
    const labels = Array.from(container.querySelectorAll('text.pay-be-lbl'));
    expect(labels).toHaveLength(1);
  });
});
