// The impact map opened with its top row cut at the frame, an "is imported by" label sitting across
// two cards, and its Fit control in a row of its own outside the frame. Each has a rule now:
//   - a fit the zoom floor cannot complete pins the map's top, not its middle (fitToContent 'top');
//   - two cards joined by a labelled edge are laid out with room for the label, and the label sits
//     in the middle of the stretch of line between the cards (verbPoint);
//   - the Fit control is drawn on the stage it acts on.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fitToContent } from '../src/canvas/spatial/camera';
import { ImpactMap } from '../src/live/ripple/ImpactMap';
import {
  layoutImpact,
  NODE_H,
  NODE_W,
  placeVerbs,
  verbPoint,
  verbSize,
} from '../src/live/ripple/layout';
import type { ShipEdge, ShipNode } from '../src/live/ripple/model';
import { SEED_SHIP } from '../src/live/ripple/seed';

afterEach(cleanup);

type Box = { l: number; t: number; r: number; b: number };
const overlaps = (a: Box, b: Box): boolean =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;

function verbsOnCards(nodes: readonly ShipNode[], edges: readonly ShipEdge[]): string[] {
  const l = layoutImpact(nodes, edges);
  const spots = placeVerbs(l.nodes, edges);
  const cards = l.nodes.map((p) => ({
    id: p.node.id,
    box: { l: p.x - NODE_W / 2, t: p.y - NODE_H / 2, r: p.x + NODE_W / 2, b: p.y + NODE_H / 2 },
  }));
  const hits: string[] = [];
  edges.forEach((e, i) => {
    const p = spots[i];
    if (!p) return;
    const { w, h } = verbSize(e.verb);
    const label = { l: p.x - w / 2, t: p.y - h / 2, r: p.x + w / 2, b: p.y + h / 2 };
    for (const c of cards) if (overlaps(label, c.box)) hits.push(`"${e.verb}" on ${c.id}`);
  });
  return hits;
}

describe('impact map verb labels', () => {
  it('never sit on a card in the worked example, and every one of them is drawn', () => {
    expect(verbsOnCards(SEED_SHIP.nodes, SEED_SHIP.edges)).toEqual([]);
    const l = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges);
    const spots = placeVerbs(l.nodes, SEED_SHIP.edges);
    expect(spots.filter((s, i) => SEED_SHIP.edges[i]!.verb && !s)).toEqual([]);
  });

  it('never sit on a card when a ring of neighbours all carry a long verb', () => {
    const nodes: ShipNode[] = [
      { ...SEED_SHIP.nodes[0]!, id: 'hub', type: 'pr' },
      ...Array.from({ length: 9 }, (_, i) => ({
        ...SEED_SHIP.nodes[1]!,
        id: `n${i}`,
        type: 'service' as const,
      })),
    ];
    const edges = nodes.slice(1).map((n, i): ShipEdge => ({
      ...SEED_SHIP.edges[0]!,
      from: i % 2 ? 'hub' : n.id,
      to: i % 2 ? n.id : 'hub',
      verb: 'is imported by',
    }));
    expect(verbsOnCards(nodes, edges)).toEqual([]);
  });

  it('sit between two side-by-side cards, not at their centres’ midpoint', () => {
    const p = verbPoint({ x: 0, y: 0 }, { x: 400, y: 0 });
    expect(p.x).toBeCloseTo(200);
    expect(p.free).toBeCloseTo(400 - NODE_W);
    // Unequal exits: the free stretch starts where the first card ends.
    const q = verbPoint({ x: 0, y: 0 }, { x: 300, y: 30 });
    expect(q.x).toBeGreaterThan(NODE_W / 2);
    expect(q.x).toBeLessThan(300 - NODE_W / 2);
  });
});

describe('impact map verb size', () => {
  it('follows the size the label renders at, not a fixed pixel count', () => {
    const base = verbSize('is imported by', 10.5);
    const big = verbSize('is imported by', 15.75);
    expect(big.w - 12).toBeCloseTo((base.w - 12) * 1.5);
    expect(big.h).toBeGreaterThan(base.h);
  });

  it('spreads labelled neighbours further when the type is bigger', () => {
    const small = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges, 10.5);
    const large = layoutImpact(SEED_SHIP.nodes, SEED_SHIP.edges, 18);
    expect(large.w * large.h).toBeGreaterThan(small.w * small.h);
    const spots = placeVerbs(large.nodes, SEED_SHIP.edges, 18);
    expect(spots.every((p, i) => !SEED_SHIP.edges[i]!.verb || p)).toBe(true);
  });
});

describe('impact map fit', () => {
  const content = { x: 0, y: 0, w: 800, h: 1200 };
  const clamp = { min: 0.9, max: 2.2 };

  it('pins the top of a map the floor cannot fit', () => {
    const cam = fitToContent(content, { w: 1000, h: 400 }, 56, clamp, 'top');
    expect(cam.scale).toBe(0.9);
    expect(cam.y).toBe(56);
  });

  it('still centres a map that fits', () => {
    const cam = fitToContent({ x: 0, y: 0, w: 400, h: 200 }, { w: 1000, h: 800 }, 56, clamp, 'top');
    expect(cam.y + 100 * cam.scale).toBeCloseTo(400);
  });

  it('keeps the old centring for surfaces that did not ask', () => {
    const cam = fitToContent(content, { w: 1000, h: 400 }, 56, clamp);
    expect(cam.y + 600 * cam.scale).toBeCloseTo(200);
  });
});

describe('impact map Fit control', () => {
  it('is drawn on the stage it fits', () => {
    const { container } = render(
      <ImpactMap
        nodes={SEED_SHIP.nodes}
        edges={SEED_SHIP.edges}
        changes={SEED_SHIP.changes}
        altitude="working"
      />,
    );
    expect(container.querySelector('.ripple-stage button[aria-label="Fit"]')).not.toBeNull();
    // With no lens or cross-repo filter to offer, there is no empty controls row above the frame.
    expect(container.querySelector('.ripple-impact-controls')).toBeNull();
  });
});
