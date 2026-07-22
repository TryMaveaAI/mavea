// synthesis/layoutCorpus.ts — the thin spatial wrapper for a Synthesis World. It reuses Prism's pure
// layout() verbatim to place the claim cards (themes cluster as regions because claim.region is a
// theme id), then positions the three corpus OBJECTS relative to those settled cards: a contradiction
// sits at the midpoint between its two claims, a consensus cluster is a hull around its members, and a
// gap is a labelled hole in its theme's negative space. Deterministic; adding objects never reshuffles
// the map (the object positions are derived from the card positions, which layout() fixes).
import { layout, CARD_W, CARD_H, type LayoutResult, type LayoutSeed } from '../layout';
import type { ConsensusCluster, ContradictionObject, CorpusSpec, GapObject } from './types';

export interface PlacedContradiction extends ContradictionObject {
  x: number;
  y: number;
}
export interface PlacedGap extends GapObject {
  x: number;
  y: number;
}
export interface PlacedConsensus extends ConsensusCluster {
  /** Hull centre. */
  x: number;
  y: number;
  /** Hull radius covering the member cards (for the faint consensus ring). */
  r: number;
}

export interface CorpusLayout extends LayoutResult {
  contradictions: PlacedContradiction[];
  gaps: PlacedGap[];
  consensus: PlacedConsensus[];
  /** The bounding box of everything placed (cards + objects), for the camera's initial fit. */
  contentBox: { x: number; y: number; w: number; h: number };
}

/** Lay out a settled corpus: cards via the reused engine, then the corpus objects around them. */
export function layoutCorpus(
  spec: CorpusSpec,
  palette: readonly string[],
  seed?: LayoutSeed,
): CorpusLayout {
  const base = layout(
    { claims: spec.claims, regions: spec.themes.map((t) => t.id) },
    palette,
    seed,
  );
  const pos = new Map(base.claims.map((c) => [c.id, { x: c.x, y: c.y }]));
  const regionByName = new Map(base.regions.map((r) => [r.name, r]));

  // A contradiction sits at the midpoint of its two claims (the visual "collision point").
  const contradictions: PlacedContradiction[] = spec.contradictions.map((x) => {
    const a = pos.get(x.a);
    const b = pos.get(x.b);
    const mx = a && b ? (a.x + b.x) / 2 : (a?.x ?? b?.x ?? base.width / 2);
    const my = a && b ? (a.y + b.y) / 2 : (a?.y ?? b?.y ?? base.height / 2);
    return { ...x, x: mx, y: my };
  });

  // A consensus cluster is a hull around its member cards: centroid + a radius that covers them.
  const consensus: PlacedConsensus[] = spec.consensus.map((c) => {
    const pts = c.memberClaimIds
      .map((id) => pos.get(id))
      .filter((p): p is { x: number; y: number } => !!p);
    if (pts.length === 0) return { ...c, x: base.width / 2, y: base.height / 2, r: CARD_W };
    const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const r =
      Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + Math.max(CARD_W, CARD_H) * 0.7;
    return { ...c, x: cx, y: cy, r };
  });

  // A gap is a hole in its theme's negative space: below the theme cluster, at the region's x. Stacked
  // per theme so multiple gaps in one theme don't collide. Corpus-wide gaps (no theme) drop to a band.
  const perTheme = new Map<string, number>();
  const gaps: PlacedGap[] = spec.gaps.map((g, i) => {
    const region = g.theme ? regionByName.get(g.theme) : undefined;
    const stack = perTheme.get(g.theme) ?? 0;
    perTheme.set(g.theme, stack + 1);
    if (region) {
      const members = base.claims.filter((c) => c.region === g.theme);
      const maxY = members.length ? Math.max(...members.map((c) => c.y)) : region.cy;
      return { ...g, x: region.cx, y: maxY + CARD_H + 24 + stack * (CARD_H + 18) };
    }
    // corpus-wide: a bottom band, spread across the width
    return {
      ...g,
      x: base.width * (0.2 + 0.6 * ((i % 4) / 3)),
      y: base.height - 60 - stack * (CARD_H + 18),
    };
  });

  return {
    ...base,
    contradictions,
    gaps,
    consensus,
    contentBox: contentBoxOf(base, contradictions, gaps, consensus),
  };
}

/** The bounding box of every placed thing — cards, objects, the consensus rings, AND the region labels
 *  (which sit above their cluster) — so the camera's initial fit frames the whole world with nothing
 *  clipped at the edges. */
function contentBoxOf(
  base: LayoutResult,
  contradictions: readonly PlacedContradiction[],
  gaps: readonly PlacedGap[],
  consensus: readonly PlacedConsensus[],
): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const box = (x: number, y: number, hw: number, hh: number): void => {
    xs.push(x - hw, x + hw);
    ys.push(y - hh, y + hh);
  };
  for (const c of base.claims) box(c.x, c.y, CARD_W / 2, CARD_H / 2);
  for (const o of [...contradictions, ...gaps]) box(o.x, o.y, CARD_W / 2, CARD_H / 2);
  for (const c of consensus) box(c.x, c.y, c.r, c.r);
  // Region labels are pills centred at (cx, cy), sitting above their cluster — include them too.
  for (const r of base.regions) box(r.cx, r.cy, 90, 22);
  if (xs.length === 0) return { x: 0, y: 0, w: base.width, h: base.height };
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    w: Math.max(1, Math.max(...xs) - minX),
    h: Math.max(1, Math.max(...ys) - minY),
  };
}
