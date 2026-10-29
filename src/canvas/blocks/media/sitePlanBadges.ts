import { formatValue } from '../../lib';

export type Pt = { x: number; y: number };

/** Distance from `p` to polygon `poly` — 0 when `p` is inside or on it. */
function distanceToPolygon(p: Pt, poly: Pt[]): number {
  if (poly.length < 3) return Infinity;
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return inside ? 0 : best;
}

/**
 * Where each setback ring's badge goes, in drawing coordinates. Every ring is an inset of the same
 * boundary, so a badge pinned to a fixed vertex lands on the next ring's badge, on the building
 * drawn inside, or under the parcel's own outline. Each ring offers its corners and edge
 * midpoints; the badge takes the one farthest from the building and from every badge already
 * placed (easement badges first, since theirs sit at fixed centroids).
 */
export function placeRingBadges(rings: Pt[][], avoid: Pt[], taken: Pt[], radius: number): Pt[] {
  const placed = [...taken];
  return rings.map((ring) => {
    const candidates: Pt[] = [];
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      candidates.push(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    });
    let best = candidates[0] ?? { x: 0, y: 0 };
    let bestScore = -Infinity;
    for (const c of candidates) {
      const fromBuilding = avoid.length >= 3 ? distanceToPolygon(c, avoid) - radius : Infinity;
      const fromBadges = placed.reduce(
        (m, q) => Math.min(m, Math.hypot(c.x - q.x, c.y - q.y) - radius * 2),
        Infinity,
      );
      const score = Math.min(fromBuilding, fromBadges);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    placed.push(best);
    return best;
  });
}

/** True when an authored label already states the offset ("Front yard · 20 ft"), so the legend
 *  does not print the same number a second time. */
export function labelStates(label: string, offset: number): boolean {
  const n = formatValue(offset);
  let index = label.indexOf(n);
  while (index !== -1) {
    const before = label[index - 1] ?? '';
    const after = label[index + n.length] ?? '';
    if (!/[\d.]/u.test(before) && !/[\d.]/u.test(after)) return true;
    index = label.indexOf(n, index + 1);
  }
  return false;
}
