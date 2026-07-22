import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { UnitCircle } from '../src/canvas/blocks/learn/UnitCircle';

// Regression coverage for a real bug: the coordinate label's fixed 8px offset from the terminal
// point didn't scale with the label's own length, so surd-form strings like "(−√2/2, −√2/2)" —
// which the SVG renders wider than a short "(1, 0)" — pushed the label's rendered edge clean
// past the 0–240 viewBox. Because the SVG paints with overflow: visible, that overflow wasn't
// clipped — it bled outside the card frame at exactly the angles a lesson would actually use.

const VB = 240;

function coordLabel(container: HTMLElement) {
  const nodes = Array.from(container.querySelectorAll('text.lr-uc-coord'));
  expect(nodes).toHaveLength(1);
  return nodes[0] as SVGTextElement;
}

// Same glyph-width estimate the component uses internally, kept independent here so the test
// doesn't just re-assert the implementation's own arithmetic back at it.
const CHAR_W = 6.4;

function assertWithinViewBox(node: SVGTextElement) {
  const x = Number(node.getAttribute('x'));
  const anchor = node.getAttribute('text-anchor');
  const width = (node.textContent ?? '').length * CHAR_W;
  const left = anchor === 'end' ? x - width : x;
  const right = anchor === 'end' ? x : x + width;
  expect(left).toBeGreaterThanOrEqual(-0.5); // small float slack
  expect(right).toBeLessThanOrEqual(VB + 0.5);
}

describe('UnitCircle', () => {
  // These are exactly the angles whose coordinate label is long (surd form on both axes),
  // and which sit far enough around the rim that the old fixed offset ran the label past the
  // viewBox edge in one direction or the other.
  it.each([45, 135, 210, 225, 315])(
    'keeps the long surd-form coordinate label at %i° inside the viewBox',
    (angleDeg) => {
      const { container } = render(<UnitCircle title="Unit Circle" angleDeg={angleDeg} />);
      const node = coordLabel(container);
      expect(node.textContent?.length).toBeGreaterThan('(1, 0)'.length);
      assertWithinViewBox(node);
    },
  );

  it('keeps the short axis-aligned coordinate label inside the viewBox too', () => {
    const { container } = render(<UnitCircle title="Unit Circle" angleDeg={0} />);
    assertWithinViewBox(coordLabel(container));
  });

  it('stays inside the viewBox across a dense sweep of angles, not just the special ones', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const { container, unmount } = render(<UnitCircle title="Unit Circle" angleDeg={deg} />);
      assertWithinViewBox(coordLabel(container));
      unmount();
    }
  });
});
