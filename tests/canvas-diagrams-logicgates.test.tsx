import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LogicGates } from '../src/canvas/blocks/diagrams/LogicGates';
import type { LogicInput, LogicGate } from '../src/canvas/blocks/diagrams/types';

// Regression coverage for a real bug: the output pin label's x position (and the SVG viewBox
// width around it) was sized for a short label like "Y" — the demo fixture — with only a fixed
// 14-unit slack. A longer label (e.g. "CARRY_OUT", which the model is free to send) is drawn
// centred on that same pin, so half its rendered width extends past the reserved slack and
// bleeds past the viewBox's right edge, where the card's overflow:hidden clips it illegibly.

const inputs: LogicInput[] = [
  { id: 'a', label: 'A', value: 1 },
  { id: 'b', label: 'B', value: 0 },
];
const gates: LogicGate[] = [{ id: 'g1', kind: 'AND', inputs: ['a', 'b'] }];

function renderWithLabel(label: string) {
  return render(<LogicGates inputs={inputs} gates={gates} output={{ from: 'g1', label }} />);
}

describe('LogicGates', () => {
  it('keeps a short output label ("Y", the demo fixture) fully inside the viewBox', () => {
    const { container } = renderWithLabel('Y');
    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const pin = container.querySelector('text.dg-lg-pin')!;
    const x = Number(pin.getAttribute('x'));
    // .dg-lg-pin is centre-anchored — half its rendered width extends past x on either side.
    const halfW = (pin.textContent!.length * 3.1) / 2;
    expect(x + halfW).toBeLessThanOrEqual(viewW);
    expect(x - halfW).toBeGreaterThanOrEqual(0);
  });

  it('reserves enough right-margin for a long output label so it stays inside the viewBox', () => {
    const { container } = renderWithLabel('CARRY_OUT');
    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const pin = container.querySelector('text.dg-lg-pin')!;
    const x = Number(pin.getAttribute('x'));
    const halfW = (pin.textContent!.length * 3.1) / 2;
    // The full label (or its truncated form) must never bleed past the right edge of the
    // viewBox — that's the clip the fixed 14-unit slack couldn't prevent.
    expect(x + halfW).toBeLessThanOrEqual(viewW);
    expect(x - halfW).toBeGreaterThanOrEqual(0);
  });

  it('truncates a pathological output label instead of blowing up the layout', () => {
    const longLabel = 'REGISTER_WRITE_ENABLE_SIGNAL';
    const { container } = renderWithLabel(longLabel);
    const pin = container.querySelector('text.dg-lg-pin')!;
    // The rendered glyph content is capped — the full string is not dumped onto the pin.
    expect(pin.textContent!.length).toBeLessThan(longLabel.length);
    expect(pin.textContent!.endsWith('…')).toBe(true);

    const svg = container.querySelector('svg')!;
    const viewW = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const x = Number(pin.getAttribute('x'));
    const halfW = (pin.textContent!.length * 3.1) / 2;
    expect(x + halfW).toBeLessThanOrEqual(viewW);
  });
});
