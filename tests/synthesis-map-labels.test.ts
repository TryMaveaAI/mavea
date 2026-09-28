// A fused map's contradiction and gap objects are labelled with their whole claim ("Sources disagree
// on annual treatment cost", "No coverage — Pediatric population"). Ellipsising that label cut off
// exactly the words that say WHAT disagrees or what is missing, so the rule wraps instead — and the
// camera's frame has to make room for a label that wide, or the widest ones slice at the stage edge.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W } from '../src/live/prism/layout';
import { CONSENSUS_BADGE_RISE, OBJECT_MAX_W, mapContentBox } from '../src/live/prism/mapFrame';

const css = readFileSync(join(__dirname, '..', 'src/live/prism/synthesis/synthesis.css'), 'utf8');
const rule = (selector: string): string =>
  new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
const px = (block: string, prop: string): number =>
  Number(new RegExp(`(?:^|\\s)${prop}:\\s*(-?[\\d.]+)px`).exec(block)?.[1] ?? NaN);

describe('synthesis map object labels', () => {
  it('wraps rather than truncating', () => {
    const obj = rule('.syn-obj');
    expect(obj).not.toBe('');
    expect(obj).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(obj).not.toMatch(/white-space:\s*nowrap/);
  });

  it('frames with the same geometry the stylesheet draws', () => {
    expect(px(rule('.syn-obj'), 'max-width')).toBe(OBJECT_MAX_W);
    expect(-px(rule('.syn-consensus-badge'), 'top')).toBe(CONSENSUS_BADGE_RISE);
  });

  it('keeps the widest label, a ring and its badge inside the frame', () => {
    const claim = { x: 500, y: 500 };
    // A contradiction at the far left of the world, a gap at the far right, a ring above the claim.
    const objects = [
      { x: 100, y: 500 },
      { x: 900, y: 500 },
    ];
    const ring = { x: 500, y: 300, r: 150 };
    const box = mapContentBox({ claims: [claim], regions: [], objects, consensus: [ring] }, 0)!;

    expect(box.x).toBeLessThanOrEqual(100 - OBJECT_MAX_W / 2);
    expect(box.x + box.w).toBeGreaterThanOrEqual(900 + OBJECT_MAX_W / 2);
    expect(box.y).toBeLessThanOrEqual(ring.y - ring.r - CONSENSUS_BADGE_RISE);
    // A card is centred on its point, so the box reaches half a card each way — not a whole one down.
    expect(box.y + box.h).toBe(Math.max(claim.y + CARD_H / 2, 500 + CARD_H / 2));
    expect(OBJECT_MAX_W).toBeGreaterThan(CARD_W);
  });

  it('frames nothing when there is nothing to frame', () => {
    expect(mapContentBox({ claims: [], regions: [] })).toBeUndefined();
  });
});
