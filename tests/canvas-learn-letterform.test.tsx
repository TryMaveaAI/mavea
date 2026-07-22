import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LetterForm } from '../src/canvas/blocks/learn/LetterForm';
import type { LetterStroke } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: the stroke-order index circles fan out across a
// fixed-width band with a hardcoded radius, so they packed tighter as stroke count grew and
// started to overlap illegibly well beyond the ~2-4 stroke demo fixture (letters with more
// complex formation — e.g. a decorative capital, or a CJK-style stroke count — send many more).

function strokes(n: number): LetterStroke[] {
  return Array.from({ length: n }, (_, i) => ({
    order: i + 1,
    hint: `Stroke ${i + 1}`,
  }));
}

function indexCircles(container: HTMLElement) {
  return Array.from(container.querySelectorAll<SVGCircleElement>('circle.lr-lf-index')).map(
    (c) => ({
      cx: Number(c.getAttribute('cx')),
      cy: Number(c.getAttribute('cy')),
      r: Number(c.getAttribute('r')),
    }),
  );
}

describe('LetterForm', () => {
  it.each([2, 4, 8, 14, 20])(
    'fans %i stroke-order indices without any circle overlapping its neighbor',
    (n) => {
      const { container } = render(
        <LetterForm title="Formation" letter="a" strokes={strokes(n)} />,
      );
      const circles = indexCircles(container);
      expect(circles).toHaveLength(n);

      // Sorted left-to-right (they're already authored in fan order, but don't assume it).
      circles.sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < circles.length; i++) {
        const dx = circles[i].cx - circles[i - 1].cx;
        // Two circles don't overlap iff the distance between centers is at least the sum of
        // their radii. A fixed radius that ignored stroke count violated this once the fan
        // packed circles closer together than 2×r.
        expect(dx).toBeGreaterThanOrEqual(circles[i].r + circles[i - 1].r);
      }
    },
  );

  it('keeps a single stroke at the full-size radius (no shrinking needed)', () => {
    const { container } = render(<LetterForm title="Formation" letter="l" strokes={strokes(1)} />);
    const circles = indexCircles(container);
    expect(circles).toHaveLength(1);
    expect(circles[0].r).toBeGreaterThanOrEqual(8);
  });

  it('keeps circles positive-sized and non-overlapping even at an extreme stroke count', () => {
    // Well beyond anything a real letter needs, but the invariant that matters is "never
    // overlap" — a radius floor must never be allowed to win over that and collide circles.
    const { container } = render(<LetterForm title="Formation" letter="m" strokes={strokes(40)} />);
    const circles = indexCircles(container).sort((a, b) => a.cx - b.cx);
    expect(circles).toHaveLength(40);
    for (const c of circles) {
      expect(c.r).toBeGreaterThan(0);
    }
    for (let i = 1; i < circles.length; i++) {
      const dx = circles[i].cx - circles[i - 1].cx;
      expect(dx).toBeGreaterThanOrEqual(circles[i].r + circles[i - 1].r);
    }
  });
});
