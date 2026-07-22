import { describe, expect, it } from 'vitest';
import { layout, seedFrom, CARD_W, CARD_H } from '../src/live/prism/layout';
import type { Claim, PrismSpec } from '../src/live/prism/types';

// The settled map must never stack claim cards on top of each other (the bug a screenshot caught:
// 15 cards piled into one corner). layout() runs a separation pass; these tests pin that no two
// cards overlap, the layout stays inside the world, and it's deterministic.

const PALETTE = ['a', 'b', 'c', 'd', 'e', 'f'];

function makeSpec(count: number, regions = 5): PrismSpec {
  const regionNames = Array.from({ length: regions }, (_, i) => `Region ${i + 1}`);
  const claims: Claim[] = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    quote: `quote ${i}`,
    page: (i % 16) + 1,
    kind: 'finding',
    title: `Claim ${i}`,
    ask: 'why?',
    role: 'supporting',
    region: regionNames[i % regions],
    source: 0,
  }));
  return {
    documents: [{ fileName: 'doc.pdf', pageCount: 16 }],
    fileName: 'doc.pdf',
    pageCount: 16,
    claims,
    regions: regionNames,
    threads: [],
  };
}

/** Do two card rectangles (centre x/y, fixed CARD_W×CARD_H) overlap? */
function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < CARD_W && Math.abs(a.y - b.y) < CARD_H;
}

describe('prism layout', () => {
  for (const count of [1, 5, 15, 24, 40]) {
    it(`places ${count} cards with no two overlapping`, () => {
      const { claims } = layout(makeSpec(count), PALETTE);
      expect(claims).toHaveLength(count);
      for (let i = 0; i < claims.length; i += 1) {
        for (let j = i + 1; j < claims.length; j += 1) {
          expect(
            overlaps(claims[i], claims[j]),
            `cards ${i} and ${j} overlap at (${claims[i].x.toFixed(0)},${claims[i].y.toFixed(0)}) / (${claims[j].x.toFixed(0)},${claims[j].y.toFixed(0)})`,
          ).toBe(false);
        }
      }
    });
  }

  it('keeps every card inside the world bounds', () => {
    const { claims, width, height } = layout(makeSpec(20), PALETTE);
    for (const c of claims) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(width);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(height);
    }
  });

  it('is deterministic — the same spec lays out identically', () => {
    const spec = makeSpec(15);
    const a = layout(spec, PALETTE);
    const b = layout(spec, PALETTE);
    expect(a.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)])).toEqual(
      b.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
    );
  });

  it('assigns region colors from the palette in order', () => {
    const { regions } = layout(makeSpec(6, 3), PALETTE);
    expect(regions.map((r) => r.color)).toEqual(['a', 'b', 'c']);
  });

  it('anchors each region label above its cluster, clear of every card in that region', () => {
    const { regions, claims } = layout(makeSpec(20, 4), PALETTE);
    for (const region of regions) {
      const members = claims.filter((c) => c.region === region.name);
      if (members.length === 0) continue;
      const topCard = Math.min(...members.map((c) => c.y));
      // the label centre sits above the topmost card's centre (so the pill clears the card body)
      expect(
        region.cy,
        `region "${region.name}" label cy=${region.cy.toFixed(0)} not above its top card y=${topCard.toFixed(0)}`,
      ).toBeLessThan(topCard);
    }
  });

  it('links every claim into one connected backbone (no isolated cards)', () => {
    const { claims, links } = layout(makeSpec(15, 4), PALETTE);
    // union-find over the links: all claims should end in one component
    const parent = new Map(claims.map((c) => [c.id, c.id]));
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      return r;
    };
    for (const l of links) parent.set(find(l.a), find(l.b));
    const roots = new Set(claims.map((c) => find(c.id)));
    expect(roots.size).toBe(1);
  });

  it('keeps every region label clear of EVERY card (not just its own region)', () => {
    const { regions, claims } = layout(makeSpec(24, 5), PALETTE);
    for (const region of regions) {
      // mirror layout's label box: width ≈ name length, fixed half-height
      const hw = Math.max(70, region.name.length * 7 + 24) / 2;
      const hh = 26;
      for (const c of claims) {
        const overlapX = CARD_W / 2 + hw - Math.abs(c.x - region.cx);
        const overlapY = CARD_H / 2 + hh - Math.abs(c.y - region.cy);
        expect(
          overlapX > 0 && overlapY > 0,
          `label "${region.name}" overlaps card "${c.title}" (overlapX=${overlapX.toFixed(0)}, overlapY=${overlapY.toFixed(0)})`,
        ).toBe(false);
      }
    }
  });
});

// ── seeded (incremental) layout ──────────────────────────────────────────────────────────────────
// When the claim set grows (an interrogation surfaces a derived card, a veracity reflow, a data
// finding lands), the cards already on the map must stay EXACTLY where they were — only the new cards
// may move. Without this the whole map jumps on every change and spatial memory is lost.

/** Return a copy of `spec` with `extra` further claims appended (new ids, into existing regions). */
function withMoreClaims(spec: PrismSpec, extra: number): PrismSpec {
  const base = spec.claims.length;
  const more: Claim[] = Array.from({ length: extra }, (_, i) => ({
    id: `c${base + i}`,
    quote: `quote ${base + i}`,
    page: ((base + i) % 16) + 1,
    kind: 'finding',
    title: `Claim ${base + i}`,
    ask: 'why?',
    role: 'supporting',
    region: spec.regions[(base + i) % spec.regions.length],
    source: 0,
  }));
  return { ...spec, claims: [...spec.claims, ...more] };
}

describe('prism seeded layout', () => {
  it('pins every prior card exactly in place when claims are added', () => {
    const first = layout(makeSpec(15), PALETTE);
    const grown = withMoreClaims(makeSpec(15), 4);
    const next = layout(grown, PALETTE, seedFrom(first));

    const byId = new Map(next.claims.map((c) => [c.id, c]));
    for (const prior of first.claims) {
      const after = byId.get(prior.id)!;
      expect(after.x, `card ${prior.id} x moved`).toBe(prior.x);
      expect(after.y, `card ${prior.id} y moved`).toBe(prior.y);
    }
  });

  it('keeps prior region labels in place too', () => {
    const first = layout(makeSpec(15), PALETTE);
    const grown = withMoreClaims(makeSpec(15), 4);
    const next = layout(grown, PALETTE, seedFrom(first));
    const byName = new Map(next.regions.map((r) => [r.name, r]));
    for (const r of first.regions) {
      const after = byName.get(r.name)!;
      expect(after.cx).toBe(r.cx);
      expect(after.cy).toBe(r.cy);
    }
  });

  it('lands the new cards without overlapping any card (pinned or new)', () => {
    const first = layout(makeSpec(15), PALETTE);
    const grown = withMoreClaims(makeSpec(15), 5);
    const { claims } = layout(grown, PALETTE, seedFrom(first));
    expect(claims).toHaveLength(20);
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        expect(
          overlaps(claims[i], claims[j]),
          `cards ${claims[i].id} and ${claims[j].id} overlap`,
        ).toBe(false);
      }
    }
  });

  it('reuses the seed world size (no regrow, so pinned coordinates stay valid)', () => {
    const first = layout(makeSpec(15), PALETTE);
    const grown = withMoreClaims(makeSpec(15), 6);
    const next = layout(grown, PALETTE, seedFrom(first));
    expect(next.width).toBe(first.width);
    expect(next.height).toBe(first.height);
  });

  it('is deterministic — same seed + same spec lays out identically', () => {
    const first = layout(makeSpec(15), PALETTE);
    const grown = withMoreClaims(makeSpec(15), 4);
    const a = layout(grown, PALETTE, seedFrom(first));
    const b = layout(grown, PALETTE, seedFrom(first));
    expect(a.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)])).toEqual(
      b.claims.map((c) => [c.id, Math.round(c.x), Math.round(c.y)]),
    );
  });
});
