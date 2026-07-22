import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkyChart } from '../src/canvas/blocks/media/SkyChart';
import type { SkyPlanet, SkyStar } from '../src/canvas/blocks/media/types';

// Regression coverage for a real bug: star/planet labels sit beside their dot with a fixed
// pixel offset ("x + 3.2" / "x + 4"), always growing rightward. That only clears the 200×200
// viewBox for the demo fixture's short names ("Sirius", "Mars") — a longer name on a dot near
// the right edge runs the label past x=200, off the visible dome. Longer names must flip to
// end-anchored so the label grows left, into the space that's actually free.

const VIEWBOX_MAX = 200;
// Rough px-per-character at the block's label font-size, generous enough to catch real overflow
// without being brittle to sub-pixel font metrics (jsdom doesn't measure text at all).
const CHAR_W = 3.4;

function estimatedRight(el: Element): number {
  const x = Number(el.getAttribute('x'));
  const anchor = el.getAttribute('text-anchor') || 'start';
  const len = (el.textContent || '').length * CHAR_W;
  return anchor === 'end' ? x : x + len;
}

function estimatedLeft(el: Element): number {
  const x = Number(el.getAttribute('x'));
  const anchor = el.getAttribute('text-anchor') || 'start';
  const len = (el.textContent || '').length * CHAR_W;
  return anchor === 'end' ? x - len : x;
}

describe('SkyChart', () => {
  it('flips a near-edge star label to end-anchored instead of running it off the viewBox', () => {
    // x near 1 → hugging the east edge of the dome, where px(x) lands close to 200.
    const stars: SkyStar[] = [{ x: 0.98, y: 0.5, mag: -1, name: 'Alpha Centauri Proxima' }];
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const label = container.querySelector('text.sky-star-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(estimatedRight(label!)).toBeLessThanOrEqual(VIEWBOX_MAX);
  });

  it('keeps a near-edge planet label end-anchored and within the viewBox too', () => {
    const planets: SkyPlanet[] = [{ x: 0.97, y: 0.4, name: 'A Very Long Exoplanet Designation' }];
    const stars: SkyStar[] = [{ x: 0.2, y: 0.2, mag: 4 }];
    const { container } = render(<SkyChart title="Sky" stars={stars} planets={planets} />);
    const label = container.querySelector('text.sky-planet-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('end');
    expect(estimatedRight(label!)).toBeLessThanOrEqual(VIEWBOX_MAX);
  });

  it('still start-anchors a west-side label and keeps it left of x=0', () => {
    const stars: SkyStar[] = [{ x: 0.02, y: 0.5, mag: -1, name: 'Sirius' }];
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const label = container.querySelector('text.sky-star-lbl');
    expect(label).toBeTruthy();
    expect(label!.getAttribute('text-anchor')).toBe('start');
    expect(estimatedLeft(label!)).toBeGreaterThanOrEqual(0);
  });

  it('anchors every label sensibly across a full ring of long names, none bleeding past either edge', () => {
    // A ring of stars all the way around the dome, each carrying a long name — stresses every
    // quadrant at once, not just the single edge case above.
    const n = 12;
    const stars: SkyStar[] = Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 2 * Math.PI;
      return {
        x: 0.5 + 0.46 * Math.cos(t),
        y: 0.5 + 0.46 * Math.sin(t),
        mag: 1,
        name: `Designation Beta ${i}`,
      };
    });
    const { container } = render(<SkyChart title="Sky" stars={stars} />);
    const labels = Array.from(container.querySelectorAll('text.sky-star-lbl'));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(estimatedRight(label)).toBeLessThanOrEqual(VIEWBOX_MAX);
      expect(estimatedLeft(label)).toBeGreaterThanOrEqual(0);
    }
  });
});
