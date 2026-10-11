import { describe, it, expect } from 'vitest';
import { strokeBadges } from '../src/canvas/blocks/reference/scriptStrokeBadges';

// 木's two roots both leave the trunk at (50, 56), so the fourth stroke's number was painted
// exactly over the third's and the reader saw 1, 2, 4. Every badge must stay readable.
describe('strokeBadges', () => {
  const tree = [
    { order: 1, path: 'M18 38 H82' },
    { order: 2, path: 'M50 20 V92' },
    { order: 3, path: 'M50 56 L20 90' },
    { order: 4, path: 'M50 56 L82 90' },
  ];

  it('keeps every badge clear of the others when strokes share a start', () => {
    const pts = strokeBadges(tree).map((p) => p!);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(9.2);
  });

  it('moves a crowded badge along its own stroke and leaves a lone one at its start', () => {
    const [first, , third, fourth] = strokeBadges(tree);
    expect(first).toEqual({ x: 18, y: 38 });
    expect(third).toEqual({ x: 50, y: 56 });
    expect(fourth!.x).toBeGreaterThan(50);
    expect(fourth!.y).toBeGreaterThan(56);
  });

  it('reads relative and axis-only first segments', () => {
    const [a, b] = strokeBadges([
      { order: 1, path: 'M40 40 h20' },
      { order: 2, path: 'M40 40 v20' },
    ]);
    expect(a).toEqual({ x: 40, y: 40 });
    expect(b!.x).toBeCloseTo(40);
    expect(b!.y).toBeGreaterThan(40);
  });
});
