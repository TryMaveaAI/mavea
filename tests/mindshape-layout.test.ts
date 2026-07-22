import { describe, it, expect } from 'vitest';
import { computeLayout } from '../src/canvas/blocks/diagrams/mindShapeLayout';
import type { MindAtom } from '../src/live/mindshape/types';

// The Watch-Me-Think map builds additively while the user talks. Its layout must be APPEND-STABLE:
// a new atom landing should nudge only its neighbours, never re-throw every existing card onto a
// fresh ring (the "map reshuffles on every word" jank). computeLayout takes the previous frame's
// positions as a seed to guarantee that; this locks the behaviour without depending on the exact
// world coordinates (which are centred on CX/CY, not the origin).

const atom = (id: string): MindAtom => ({
  id,
  kind: 'want',
  label: id,
  quote: `said ${id}`,
  status: 'stable',
  confidence: 'said',
});

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('computeLayout — append-stable layout', () => {
  it('keeps existing atoms near their prior spots when a new atom lands, instead of re-throwing them', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const before = computeLayout(ids.map(atom)).positions;
    const seeded = computeLayout([...ids, 'e'].map(atom), undefined, before).positions;
    const fresh = computeLayout([...ids, 'e'].map(atom)).positions;
    // Total drift of the EXISTING cards is strictly smaller when their positions are seeded than
    // when the layout is recomputed from scratch (which re-throws the whole ring on every add).
    const drift = (m: Map<string, { x: number; y: number }>) =>
      ids.reduce((s, id) => s + dist(m.get(id)!, before.get(id)!), 0);
    expect(drift(seeded)).toBeLessThan(drift(fresh));
    // The genuinely new atom is still placed (never dropped).
    expect(seeded.get('e')).toBeTruthy();
  });

  it('a seeded card that has no overlap is left exactly where it was', () => {
    // Two cards on opposite sides of the map do not overlap, so the de-clump pass moves neither —
    // seeding them reproduces their positions to the pixel.
    const two = computeLayout([atom('a'), atom('b')]).positions;
    const again = computeLayout([atom('a'), atom('b')], undefined, two).positions;
    expect(dist(again.get('a')!, two.get('a')!)).toBeLessThan(0.001);
    expect(dist(again.get('b')!, two.get('b')!)).toBeLessThan(0.001);
  });

  it('a brand-new atom (no seed entry) still enters from the ring, not from a stale spot', () => {
    const seed = computeLayout([atom('a')]).positions; // only 'a' has a prior position
    const grown = computeLayout([atom('a'), atom('b')], undefined, seed).positions;
    // 'a' stays put; 'b' is newly placed somewhere else (not collapsed onto 'a').
    expect(dist(grown.get('a')!, seed.get('a')!)).toBeLessThan(0.001);
    expect(dist(grown.get('b')!, seed.get('a')!)).toBeGreaterThan(1);
  });
});
