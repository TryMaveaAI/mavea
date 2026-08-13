// Claim kinds are model-authored, so nothing downstream may assume one of the seven. Prism tints
// and labels a card through per-kind maps keyed by the palette; a kind outside it used to arrive as
// an undefined lookup and crash the whole overlay — which is how the walkthrough's Prism chapter
// came to open on "Couldn't open feature" after a bake returned "prediction" and "caveat".
import { describe, expect, it } from 'vitest';
import { asClaimKind, CLAIM_KINDS } from '../src/live/prism/types';
import { loadTourPrism } from '../src/tour/corpus/prism';

describe('claim kinds', () => {
  it('keeps every kind in the palette', () => {
    for (const kind of CLAIM_KINDS) expect(asClaimKind(kind)).toBe(kind);
  });

  it('reads a near-miss kind as a plain finding', () => {
    expect(asClaimKind('prediction')).toBe('finding');
    expect(asClaimKind('caveat')).toBe('finding');
    expect(asClaimKind('STAT')).toBe('stat');
    expect(asClaimKind(undefined)).toBe('finding');
    expect(asClaimKind(7)).toBe('finding');
  });

  it('lands every baked tour claim inside the palette', async () => {
    const docs = await loadTourPrism();
    expect(docs.length).toBeGreaterThan(0);
    const kinds = docs.flatMap((d) => d.spec.claims.map((c) => c.kind));
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.filter((k) => !(CLAIM_KINDS as readonly string[]).includes(k))).toEqual([]);
  });
});
