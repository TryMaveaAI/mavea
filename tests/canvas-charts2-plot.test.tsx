import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Plot } from '../src/canvas/blocks/charts2/Plot';
import type { PlotMarker } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: a marker's label was drawn start-anchored at a fixed
// +5px offset from its point with no text-length constraint. A marker near the right edge
// (a very plausible "called-out point" position, e.g. the curve's endpoint) pushed its label
// past the SVG viewBox's right edge once the label had more than a few characters — the demo
// fixture's short labels never happened to trip it. The fix ellipsises long labels and picks
// whichever side of the point has more room, clamping the anchor so the rendered text never
// crosses the plot's inner padding regardless of which edge the point sits near.

const W = 320;
const PAD = { l: 30, r: 40, t: 12 };
const MK_CHAR_W = 5.2; // must track Plot.tsx's own estimate
const MK_LABEL_MAX_CHARS = 26; // must track Plot.tsx's own truncation limit

function markerLabel(container: HTMLElement) {
  return container.querySelector('.c2-plot-mk');
}

describe('Plot', () => {
  it.each(['Peak', 'Local maximum here', 'A very long descriptive callout label for this point'])(
    'keeps the marker label "%s" inside the viewBox at the right edge',
    (label) => {
      const markers: PlotMarker[] = [{ x: 10, y: 10, label }];
      const { container } = render(
        <Plot
          title="Growth"
          curves={[
            {
              label: 'f(x)',
              points: [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
              ],
            },
          ]}
          xDomain={[0, 10]}
          yDomain={[0, 10]}
          markers={markers}
        />,
      );
      const text = markerLabel(container);
      expect(text).toBeTruthy();
      // Long labels are ellipsised to a fixed cap so no single label can ever demand more
      // width than the plot has to give; short labels render verbatim.
      const expected =
        label.length > MK_LABEL_MAX_CHARS
          ? `${label.slice(0, MK_LABEL_MAX_CHARS - 1).trimEnd()}…`
          : label;
      expect(text!.textContent).toBe(expected);
      const x = Number.parseFloat(text!.getAttribute('x') ?? '');
      const anchor = text!.getAttribute('text-anchor');
      const estimatedWidth = expected.length * MK_CHAR_W;
      if (anchor === 'end') {
        // end-anchored text grows leftward from x — its rendered left edge must not cross the
        // left inner padding, and its anchor must not sit past the right inner padding.
        expect(x).toBeLessThanOrEqual(W - PAD.r + 0.5);
        expect(x - estimatedWidth).toBeGreaterThanOrEqual(PAD.l - 0.5);
      } else {
        // start-anchored text grows rightward from x — its rendered right edge must not cross
        // the right inner padding.
        expect(anchor).toBe('start');
        expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
      }
    },
  );

  it('keeps a long label on a left-edge marker inside the viewBox too', () => {
    const markers: PlotMarker[] = [
      { x: 0, y: 10, label: 'A very long descriptive callout label for this point' },
    ];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        xDomain={[0, 10]}
        yDomain={[0, 10]}
        markers={markers}
      />,
    );
    const text = markerLabel(container);
    expect(text).toBeTruthy();
    const x = Number.parseFloat(text!.getAttribute('x') ?? '');
    const anchor = text!.getAttribute('text-anchor');
    const estimatedWidth = text!.textContent!.length * MK_CHAR_W;
    // A left-edge point has more room to the right, so the label should stay start-anchored
    // and grow rightward — but must still not cross the right inner padding.
    expect(anchor).toBe('start');
    expect(x).toBeGreaterThanOrEqual(PAD.l - 0.5);
    expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
  });

  it('keeps a top-edge marker label from crossing above the plot frame', () => {
    const markers: PlotMarker[] = [{ x: 5, y: 10, label: 'Ceiling' }];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        xDomain={[0, 10]}
        yDomain={[0, 10]}
        markers={markers}
      />,
    );
    const text = markerLabel(container);
    expect(text).toBeTruthy();
    const y = Number.parseFloat(text!.getAttribute('y') ?? '');
    expect(y).toBeGreaterThanOrEqual(PAD.t);
  });

  it('renders no marker label element when a marker has no label', () => {
    const markers: PlotMarker[] = [{ x: 5, y: 5 }];
    const { container } = render(
      <Plot
        title="Growth"
        curves={[
          {
            label: 'f(x)',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 10 },
            ],
          },
        ]}
        markers={markers}
      />,
    );
    expect(markerLabel(container)).toBeNull();
  });
});
