import { describe, expect, it } from 'vitest';
import { layoutNeighborhoods, worldDims } from '../src/live/atlas/flight';
import type { Neighborhood } from '../src/live/atlas/neighborhoods';

// The galaxy packed ~36 neighborhoods into a fixed world and their labels collided (a screenshot
// caught "MUSIC/SORTED/MEDICINE" stacked unreadable). The fix: the world grows with the count and
// the separation pass clears the LABEL footprint, not just the ellipse. These tests pin that no two
// neighborhood labels overlap at realistic counts, the world grows, and layout is deterministic.

function makeHoods(count: number): Neighborhood[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `hood-${i}`,
    name: `NEIGHBORHOOD ${i}`,
    color: '#888',
    records: Array.from({ length: (i % 5) + 1 }, (_, k) => ({
      id: `r${i}-${k}`,
      title: `topic ${i} item ${k}`,
      question: `q ${i}`,
      savedAt: 1,
      topic: `Topic ${i}`,
    })) as Neighborhood['records'],
  }));
}

/** The label half-extent the layout reserves (mirrors flight.ts's estimate). */
function labelHalf(h: Neighborhood): { hx: number; hy: number } {
  const chars = Math.max(h.name.length, `${h.records.length} conversations`.length);
  return { hx: Math.max(70, chars * 5.4), hy: 34 };
}

describe('atlas neighborhood layout', () => {
  it('grows the world with the neighborhood count', () => {
    const small = worldDims(4);
    const big = worldDims(40);
    expect(big.width).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(small.height);
    // base floor: never smaller than 1280×720
    expect(small.width).toBeGreaterThanOrEqual(1280);
  });

  for (const count of [3, 12, 24, 36]) {
    it(`places ${count} neighborhoods with no two labels overlapping`, () => {
      const hoods = makeHoods(count);
      const { places, width, height } = layoutNeighborhoods(hoods);
      expect(places).toHaveLength(count);
      for (let i = 0; i < places.length; i += 1) {
        // inside the world
        expect(places[i].x).toBeGreaterThanOrEqual(0);
        expect(places[i].x).toBeLessThanOrEqual(width);
        expect(places[i].y).toBeGreaterThanOrEqual(0);
        expect(places[i].y).toBeLessThanOrEqual(height);
        for (let j = i + 1; j < places.length; j += 1) {
          const li = labelHalf(hoods[i]);
          const lj = labelHalf(hoods[j]);
          const dx = Math.abs(places[i].x - places[j].x);
          const dy = Math.abs(places[i].y - places[j].y);
          // labels overlap only if BOTH axes are within the summed label half-extents
          const labelsCollide = dx < li.hx + lj.hx && dy < li.hy + lj.hy;
          expect(
            labelsCollide,
            `labels ${i}/${j} collide at (${places[i].x.toFixed(0)},${places[i].y.toFixed(0)}) / (${places[j].x.toFixed(0)},${places[j].y.toFixed(0)})`,
          ).toBe(false);
        }
      }
    });
  }

  it('is deterministic — same hoods lay out identically', () => {
    const hoods = makeHoods(20);
    const a = layoutNeighborhoods(hoods);
    const b = layoutNeighborhoods(hoods);
    expect(a.places.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual(
      b.places.map((p) => [Math.round(p.x), Math.round(p.y)]),
    );
  });
});
