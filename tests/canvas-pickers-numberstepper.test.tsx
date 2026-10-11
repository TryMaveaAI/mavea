import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Numberstepper } from '../src/canvas/blocks/pickers/Numberstepper';

// The decrement button once drew the icon set's × rotated 45° — which is a plus, so the stepper
// showed "+" on both sides. And the bounds row glued a word unit to the number ("1pizzas").
describe('Numberstepper', () => {
  it('draws a minus on the decrement button, not a second plus', () => {
    const { getByLabelText } = render(<Numberstepper title="Chefs" value={4} min={1} max={12} />);
    const minus = getByLabelText('Decrease').querySelector('path')?.getAttribute('d');
    const plus = getByLabelText('Increase').querySelector('path')?.getAttribute('d');
    expect(minus).toBe('M5 12h14');
    expect(minus).not.toBe(plus);
  });

  it('labels the bounds without running a word unit into the number', () => {
    const { container } = render(
      <Numberstepper title="Chefs" value={4} min={1} max={12} suffix="pizzas" prefix="" />,
    );
    const bounds = [...container.querySelectorAll('.ns-bounds span')].map((s) => s.textContent);
    expect(bounds).toEqual(['min 1', 'max 12']);
  });
});
