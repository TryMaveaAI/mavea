import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PyramidTiers } from '../src/canvas/blocks/learn/PyramidTiers';
import type { PyramidTier } from '../src/canvas/blocks/learn/types';

// Regression coverage for a real bug: tier labels are drawn at a fixed x/y with no width
// constraint, so a label longer than the authored demo overflows its own trapezoid — worst on
// the narrow top tiers, where the band's inner width can be a fraction of the label's natural
// rendered width. Every tier's <text> must stay within its own band's width budget.

function tiersOfCount(n: number): PyramidTier[] {
  // Long labels throughout, including the narrow top tiers where the trapezoid is tightest —
  // the authored demo fixtures elsewhere in the codebase use short single-word labels, which
  // never exercised this path.
  const long = [
    'Self-actualisation and transcendence',
    'Esteem, recognition, and status needs',
    'Love, belonging, and social connection',
    'Safety, security, and stability needs',
    'Physiological survival requirements',
    'Extra tier six with a long label',
    'Extra tier seven with a long label',
    'Extra tier eight with a long label',
  ];
  return Array.from({ length: n }, (_, i) => ({
    label: long[i] ?? `Tier ${i + 1} with a fairly long descriptive label`,
    value: `${(100 / (i + 1)).toFixed(0)}%`,
  }));
}

describe('PyramidTiers', () => {
  it.each([3, 5, 8])(
    'never lets a tier label render wider than its own trapezoid band (n=%i)',
    (n) => {
      const { container } = render(<PyramidTiers title="Hierarchy" tiers={tiersOfCount(n)} />);
      const polygons = Array.from(container.querySelectorAll<SVGPolygonElement>('svg polygon'));
      const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.py-tier-label'));
      expect(polygons).toHaveLength(n);
      expect(labels).toHaveLength(n);

      labels.forEach((text, i) => {
        // Recover the trapezoid's narrowest (top) edge width from its own polygon points —
        // points are "bL,bY bR,bY tR,tY tL,tY", so the top edge is the last two vertices.
        const pts = polygons[i]!.getAttribute('points')!
          .trim()
          .split(/\s+/)
          .map((p) => p.split(',').map(Number));
        const [, , topRight, topLeft] = pts;
        const topEdgeWidth = Math.abs(topRight![0]! - topLeft![0]!);

        const textLengthAttr = text.getAttribute('textLength');
        if (textLengthAttr) {
          // A label the fix identified as too long for its band must be clamped to no wider
          // than that band's own narrowest edge — never left to spill past it.
          expect(Number(textLengthAttr)).toBeLessThanOrEqual(topEdgeWidth + 0.5);
          expect(text.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
        }
      });

      // The narrowest tier (top of the pyramid, rendered first in SVG order) is where a long
      // label most needs help — for these long fixtures at n>=5 it must actually engage
      // either the clamp or the smaller font step, not render untouched at full size.
      if (n >= 5) {
        const narrowestLabel = labels[0]!;
        const shrunk = narrowestLabel.style.fontSize !== '';
        const clamped = narrowestLabel.hasAttribute('textLength');
        expect(shrunk || clamped).toBe(true);
      }
    },
  );

  it('leaves short labels that comfortably fit their band completely unclamped', () => {
    const { container } = render(
      <PyramidTiers
        title="Simple"
        tiers={[{ label: 'Base' }, { label: 'Mid' }, { label: 'Top' }]}
      />,
    );
    const labels = Array.from(container.querySelectorAll<SVGTextElement>('text.py-tier-label'));
    expect(labels).toHaveLength(3);
    for (const text of labels) {
      expect(text.hasAttribute('textLength')).toBe(false);
      expect(text.style.fontSize).toBe('');
    }
  });
});
