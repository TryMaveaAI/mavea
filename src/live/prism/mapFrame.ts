// What the map camera has to keep in view: the box around everything drawn in world space. Cards and
// corpus objects are CENTRED on their point (`translate(-50%, -50%)`), and a consensus ring carries its
// count badge above its rim, so a box built from top-left corners, or from the cards alone, let the
// fit slide a ring's top and badge under the stage edge.
import { CARD_H, CARD_W } from './layout';

/** `.syn-obj`'s max-width in synthesis.css: a contradiction or gap label wraps inside this, so its
 *  box can be this wide, far wider than a card. */
export const OBJECT_MAX_W = 300;

/** How far a consensus ring's count badge rises above the rim: `.syn-consensus-badge { top: -11px }`. */
export const CONSENSUS_BADGE_RISE = 11;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

export interface MapContents {
  claims: readonly Point[];
  regions: readonly { cx: number; cy: number }[];
  /** Contradiction and gap objects: labelled pills, up to OBJECT_MAX_W wide. */
  objects?: readonly Point[];
  consensus?: readonly (Point & { r: number })[];
}

/** The world-space box around every card, region label, object and consensus ring, padded by `pad`.
 *  Undefined when there are no claims to frame. */
export function mapContentBox(contents: MapContents, pad = 56): Box | undefined {
  if (contents.claims.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const cover = (x: number, y: number, hw: number, top: number, bottom = top): void => {
    minX = Math.min(minX, x - hw);
    minY = Math.min(minY, y - top);
    maxX = Math.max(maxX, x + hw);
    maxY = Math.max(maxY, y + bottom);
  };
  for (const c of contents.claims) cover(c.x, c.y, CARD_W / 2, CARD_H / 2);
  for (const r of contents.regions) cover(r.cx, r.cy, 0, 0);
  for (const o of contents.objects ?? []) cover(o.x, o.y, OBJECT_MAX_W / 2, CARD_H / 2);
  for (const c of contents.consensus ?? []) cover(c.x, c.y, c.r, c.r + CONSENSUS_BADGE_RISE, c.r);
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
