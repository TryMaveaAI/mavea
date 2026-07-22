import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FretboardMap } from '../src/canvas/blocks/learn/FretboardMap';
import type { FretDot } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: the dot label sits inside a small fretted-note circle
// (r=5-6 SVG units) painted at a fixed 6.5px font-size — fine for the demo fixture's 1-2 char
// interval shorthand ("R", "b3", "5", "b7") but a longer note/interval label ("bVII", "maj7")
// overflowed that circle at the same size. The fix scales the font down as the label grows.

const SHORT_LABELS: FretDot[] = [
  { string: 6, fret: 5, label: 'R', role: 'root' },
  { string: 5, fret: 5, label: '4', role: 'other' },
  { string: 5, fret: 7, label: '5', role: 'fifth' },
];

const LONG_LABELS: FretDot[] = [
  { string: 6, fret: 5, label: 'bVII', role: 'root' },
  { string: 5, fret: 5, label: 'maj7', role: 'other' },
  { string: 5, fret: 7, label: 'sus4', role: 'fifth' },
];

function labelFontSizes(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGTextElement>('text.fbm-dot-lbl')).map((t) =>
    Number((t.style.fontSize || '').replace('px', '')),
  );
}

describe('FretboardMap', () => {
  it("keeps the demo fixture's short (1-2 char) labels at full size", () => {
    const { container } = render(
      <FretboardMap title="Shape" dots={SHORT_LABELS} scaleName="Test shape" />,
    );
    const sizes = labelFontSizes(container);
    expect(sizes).toHaveLength(SHORT_LABELS.length);
    for (const size of sizes) {
      expect(size).toBeCloseTo(6.5);
    }
  });

  it('shrinks labels longer than 2 characters so they still fit inside the dot circle', () => {
    const { container } = render(
      <FretboardMap title="Shape" dots={LONG_LABELS} scaleName="Test shape" />,
    );
    const dots = Array.from(container.querySelectorAll<SVGCircleElement>('circle.fbm-dot'));
    const sizes = labelFontSizes(container);
    expect(sizes).toHaveLength(LONG_LABELS.length);

    for (let i = 0; i < LONG_LABELS.length; i++) {
      const label = LONG_LABELS[i].label!;
      const fontSize = sizes[i];
      const r = Number(dots[i].getAttribute('r'));
      // Strictly smaller than the short-label baseline — this is the regression the bug allowed:
      // every label painted at the same 6.5px regardless of length.
      expect(fontSize).toBeLessThan(6.5);
      // A conservative average-glyph-width estimate (monospace-ish upper bound for bold text)
      // must fit within the dot's diameter, so the label never bleeds past its own circle.
      const estWidth = label.length * fontSize * 0.62;
      expect(estWidth).toBeLessThanOrEqual(r * 2);
    }
  });

  it('shrinks a 3-char label less than a 4+ char label', () => {
    const dots: FretDot[] = [
      { string: 6, fret: 5, label: 'b13', role: 'other' },
      { string: 5, fret: 5, label: 'maj7', role: 'other' },
    ];
    const { container } = render(<FretboardMap title="Shape" dots={dots} />);
    const [threeChar, fourChar] = labelFontSizes(container);
    expect(threeChar).toBeGreaterThan(fourChar);
    expect(threeChar).toBeLessThan(6.5);
  });
});
