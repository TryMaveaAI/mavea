// layout.ts — the pure spatial layout for Prism's settled map. Regions sit on a wide ring;
// each region's claims seed on a golden-angle spiral, then a separation pass pushes overlapping
// cards apart so none collide. Deterministic (no physics loop, no randomness): the same spec always
// lays out identically, so the map never reshuffles on a re-render. Kept apart from the component so
// the no-overlap guarantee is unit-tested.
import type { Claim } from './types';

/** The minimal shape `layout()` needs: a flat set of claims and the ordered region names they cluster
 *  into. `PrismSpec` satisfies it (single document, regions = sections); the corpus `CorpusSpec`
 *  satisfies it too (regions = theme ids, `claim.region` = the theme id). Widening the parameter to
 *  this structural type lets the same ring/spiral/separation engine lay out a whole-corpus world with
 *  zero changes to the geometry below. */
export interface LayoutInput {
  claims: readonly Claim[];
  regions: readonly string[];
}

// Base world size (a handful of cards). The world grows with the claim count so the separation pass
// always has room — a 30-claim paper gets a bigger canvas, scaled to fit the panel by the CSS.
export const WORLD_W = 1360;
export const WORLD_H = 820;

// A claim card's collapsed footprint — the separation pass keeps this much clear around each card.
export const CARD_W = 200;
export const CARD_H = 96;

const GOLDEN = 2.399_963_22;

export interface Placed extends Claim {
  x: number;
  y: number;
}

export interface RegionPlace {
  name: string;
  /** Accent token (the caller maps region index → palette). */
  color: string;
  cx: number;
  cy: number;
}

/** A structural connector between two claims (by id) — the faint "this map is one document" backbone,
 *  distinct from the coloured contradiction/agreement threads. */
export interface Link {
  a: string;
  b: string;
}

export interface LayoutResult {
  regions: RegionPlace[];
  claims: Placed[];
  /** Faint connector lines linking related claims (within a region + region-to-region), so the map
   *  always reads as a connected structure even when there are no contradiction threads. */
  links: Link[];
  /** The actual world size used (grows with claim count); the component renders + scales to this. */
  width: number;
  height: number;
}

/**
 * A prior layout to lay out *against*. When the claim set grows (an interrogation surfaces a derived
 * card, a veracity pass reflows, a data finding lands), we want the cards that were already settled to
 * stay exactly where they were and only the new cards to find a free spot — otherwise the whole map
 * jumps on every question and the spatial memory is lost. Pass the previous {@link LayoutResult}'s
 * pieces here and any claim whose id is in `claims` is PINNED (never moves); everything else seeds and
 * separates around the pinned cards as fixed obstacles. The world size is reused (not regrown) so the
 * pinned coordinates stay valid.
 */
export interface LayoutSeed {
  /** Previous placements by claim id — these cards are pinned and will not move. */
  claims: ReadonlyMap<string, { x: number; y: number }>;
  /** Previous region centres by name — kept stable so pinned clusters keep their labels in place. */
  regions: ReadonlyMap<string, { cx: number; cy: number }>;
  /** The world size to reuse, so pinned coordinates remain valid (no regrow → no global shift). */
  width: number;
  height: number;
}

/**
 * Size the world to comfortably hold `count` cards: enough total area for every card's footprint
 * plus breathing room, never smaller than the base. Keeps the 1360:820 aspect so the CSS fit stays
 * simple. This is what guarantees the separation pass can always resolve to zero overlaps.
 */
function worldSize(count: number): { w: number; h: number } {
  const ASPECT = WORLD_W / WORLD_H;
  // Each card needs ~ (CARD_W+pad)(CARD_H+pad); aim to fill ~26% of the world so there's ample slack
  // for the separation pass to converge even with region-label obstacles competing for space.
  const needed = count * (CARD_W + 40) * (CARD_H + 40);
  const area = Math.max(WORLD_W * WORLD_H, needed / 0.22);
  const h = Math.sqrt(area / ASPECT);
  return { w: Math.round(h * ASPECT), h: Math.round(h) };
}

/** Place regions on a ring, spiral each region's claims, then separate so no two cards overlap.
 *  Pass `seed` to lay out against a prior result: cards whose id is in the seed are PINNED in place
 *  and only the new cards seek a free spot around them (so the map never reshuffles on a change). */
export function layout(
  spec: LayoutInput,
  palette: readonly string[],
  seed?: LayoutSeed,
): LayoutResult {
  // Seeded mode reuses the prior world size so pinned coordinates stay valid (no regrow → no shift).
  const { w: WW, h: WH } = seed ? { w: seed.width, h: seed.height } : worldSize(spec.claims.length);
  const isPinned = (id: string): boolean => seed?.claims.has(id) ?? false;
  const n = Math.max(1, spec.regions.length);
  const ringR = Math.min(WW, WH) * 0.34;
  const regions: RegionPlace[] = spec.regions.map((name, i) => {
    const prior = seed?.regions.get(name);
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      name,
      color: palette[i % palette.length],
      // a region carried over from the seed keeps its centre (and thus its pinned cluster's label);
      // a genuinely new region takes the next ring slot.
      cx: prior ? prior.cx : WW / 2 + Math.cos(a) * ringR,
      cy: prior ? prior.cy : WH / 2 + Math.sin(a) * ringR * 0.82,
    };
  });
  const regionByName = new Map(regions.map((r) => [r.name, r]));

  // group claims by region so each cluster spirals around its own centre
  const byRegion = new Map<string, Claim[]>();
  for (const c of spec.claims) {
    const arr = byRegion.get(c.region) ?? [];
    arr.push(c);
    byRegion.set(c.region, arr);
  }

  const claims: Placed[] = [];
  for (const [region, members] of byRegion) {
    const home = regionByName.get(region) ?? regions[0];
    members.forEach((c, i) => {
      const pin = seed?.claims.get(c.id);
      if (pin) {
        // a pinned card keeps its exact prior position (the separation pass treats it as immovable).
        claims.push({ ...c, x: pin.x, y: pin.y });
        return;
      }
      // a new card seeds on the same golden-angle spiral it would have had — the separation pass then
      // nudges it off any pinned card it lands on. (No seed → no pins → byte-identical to before.)
      const r = 30 + 56 * Math.sqrt(i);
      const a = i * GOLDEN;
      claims.push({
        ...c,
        x: home.cx + Math.cos(a) * r,
        y: home.cy + Math.sin(a) * r * 0.92,
      });
    });
  }

  // ── separation: push overlapping cards apart, clamping inside the loop so cards forced to an edge
  //    still separate against the boundary instead of stacking on it. ──
  const PAD_X = 14;
  const PAD_Y = 14;
  const MX = CARD_W / 2 + 20;
  const MY = CARD_H / 2 + 44;
  const clamp = (c: Placed): void => {
    c.x = Math.min(WW - MX, Math.max(MX, c.x));
    c.y = Math.min(WH - MY, Math.max(MY, c.y));
  };

  // A region label is a real obstacle: cards must not overlap ANY label (not just their own region's),
  // or "PARTITIONING AND REPLICATION" ends up drawn through a neighbouring card. We model each label
  // as a box centred on (cx, cy) and push cards out of it during separation. Label width ≈ the pill's
  // rendered width (font-data ~7px/char + padding); height is the pill height plus a little air.
  const LABEL_GAP = CARD_H / 2 + 26;
  const labelBox = (region: RegionPlace): { hw: number; hh: number } => ({
    hw: Math.max(70, region.name.length * 7 + 24) / 2,
    hh: 26,
  });

  // A pinned card (carried over from the seed) is immovable: it acts as a fixed obstacle, and the full
  // separation shove falls on its non-pinned partner. With no seed, nothing is pinned and every push
  // splits evenly — byte-identical to the original behaviour.
  const movable = (c: Placed): boolean => !isPinned(c.id);

  // Two cards can only touch within CARD_W + PAD_X / CARD_H + PAD_Y of each other, so the pass below
  // files cards into cells exactly that big: a card's only possible partners sit in its own cell or
  // the eight around it, and every card beyond that is skipped without a test. `worldSize` grows the
  // canvas to hold the cards at a fixed density, so a neighbourhood holds a handful of cards whether
  // the map is one paper or a whole corpus — which is what keeps a pass proportional to the claim
  // count.
  const CELL_W = CARD_W + PAD_X;
  const CELL_H = CARD_H + PAD_Y;
  const cellX = (x: number): number => Math.floor(x / CELL_W);
  const cellY = (y: number): number => Math.floor(y / CELL_H);
  // Column and row fold into one number so the index can be a plain numeric-keyed Map. Cards seed on
  // a spiral that can start outside the world, so cell coordinates are signed and unbounded — a
  // fixed-size array would have to clamp them. The stride is far wider than any row a world can
  // reach, so the fold stays unique; and were a pathological coordinate to fold two cells together,
  // it would only cost a redundant overlap test, never a missed collision.
  const COLUMN_STRIDE = 2 ** 26;
  const cellKey = (gx: number, gy: number): number => gx * COLUMN_STRIDE + gy;

  const separate = (): void => {
    // Where every card currently sits. Any nudge below re-files the card immediately, so a lookup
    // always sees live positions — the same thing an all-pairs sweep sees when it reaches a pair.
    const cells = new Map<number, number[]>();
    const cellOf = claims.map((c) => cellKey(cellX(c.x), cellY(c.y)));
    for (let i = 0; i < claims.length; i += 1) {
      const bucket = cells.get(cellOf[i]);
      if (bucket) bucket.push(i);
      else cells.set(cellOf[i], [i]);
    }
    const refile = (i: number): void => {
      const key = cellKey(cellX(claims[i].x), cellY(claims[i].y));
      if (key === cellOf[i]) return;
      const from = cells.get(cellOf[i]);
      if (from) from.splice(from.indexOf(i), 1);
      cellOf[i] = key;
      const to = cells.get(key);
      if (to) to.push(i);
      else cells.set(key, [i]);
    };

    // The lowest-indexed card after `after` that card `i` currently overlaps and can actually shove
    // (two pinned cards were already clear in the prior layout). A relaxation pass is order-dependent
    // — settle the same pairs in a different order and the map lands on different coordinates — so it
    // must behave exactly like an ascending scan over j. Resuming the search from the last pair we
    // acted on preserves that: nothing between the two moved, so every card the scan would have
    // stepped over as clear is still clear.
    const nextHit = (i: number, after: number): number => {
      const a = claims[i];
      const ma = movable(a);
      const gx = cellX(a.x);
      const gy = cellY(a.y);
      let hit = -1;
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const bucket = cells.get(cellKey(gx + ox, gy + oy));
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k += 1) {
            const j = bucket[k];
            if (j <= after || (hit >= 0 && j > hit)) continue;
            const b = claims[j];
            if (!ma && !movable(b)) continue;
            const overlapX = CARD_W + PAD_X - Math.abs(b.x - a.x);
            const overlapY = CARD_H + PAD_Y - Math.abs(b.y - a.y);
            if (overlapX > 0 && overlapY > 0) hit = j;
          }
        }
      }
      return hit;
    };

    for (let pass = 0; pass < 600; pass += 1) {
      let moved = false;
      // card ↔ card
      for (let i = 0; i < claims.length; i += 1) {
        const a = claims[i];
        const ma = movable(a);
        let after = i;
        for (let j = nextHit(i, after); j >= 0; j = nextHit(i, after)) {
          after = j;
          const b = claims[j];
          const mb = movable(b);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = CARD_W + PAD_X - Math.abs(dx);
          const overlapY = CARD_H + PAD_Y - Math.abs(dy);
          // split the correction by movability: even when both move, all of it onto one when the
          // other is pinned.
          const aShare = ma ? (mb ? 0.5 : 1) : 0;
          const bShare = mb ? (ma ? 0.5 : 1) : 0;
          if (overlapX < overlapY) {
            const push = (overlapX + 1) * (dx < 0 ? -1 : 1);
            a.x -= push * aShare;
            b.x += push * bShare;
          } else {
            const push = (overlapY + 1) * (dy < 0 ? -1 : 1);
            a.y -= push * aShare;
            b.y += push * bShare;
          }
          if (ma) clamp(a);
          if (mb) clamp(b);
          refile(i);
          refile(j);
          moved = true;
        }
      }
      // card ↔ label (push the card fully out of any label box; labels stay put — and a pinned card,
      // being immovable, was already clear of its seed-era label, so we only nudge movable cards)
      for (const region of regions) {
        const { hw, hh } = labelBox(region);
        for (let i = 0; i < claims.length; i += 1) {
          const c = claims[i];
          if (!movable(c)) continue;
          const dx = c.x - region.cx;
          const dy = c.y - region.cy;
          const overlapX = CARD_W / 2 + hw + PAD_X - Math.abs(dx);
          const overlapY = CARD_H / 2 + hh + PAD_Y - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            // Push gently (half the overlap) and let the loop converge — a full-overlap shove would
            // overshoot the card straight into a neighbour, never settling.
            if (overlapX < overlapY) {
              c.x += (overlapX / 2 + 0.5) * (dx < 0 ? -1 : 1);
            } else {
              c.y += (overlapY / 2 + 0.5) * (dy < 0 ? -1 : 1);
            }
            clamp(c);
            refile(i);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const c of claims) if (movable(c)) clamp(c);
  };

  // Seeded mode: a new card seeded on the spiral can land squarely on a pinned (immovable) card in a
  // crowded region centre, where the separation pass — unable to budge the pin — can jam. So first drop
  // each new card into the first genuinely free spot on an outward spiral from its region home; the
  // separation pass then only has to polish. (No seed → nothing pinned → this block is skipped and the
  // original spiral seeding stands untouched.)
  if (seed) {
    const fits = (x: number, y: number, placed: readonly Placed[]): boolean => {
      if (x < MX || x > WW - MX || y < MY || y > WH - MY) return false;
      for (const p of placed) {
        if (Math.abs(x - p.x) < CARD_W + PAD_X && Math.abs(y - p.y) < CARD_H + PAD_Y) return false;
      }
      for (const region of regions) {
        const { hw, hh } = labelBox(region);
        if (
          Math.abs(x - region.cx) < CARD_W / 2 + hw + PAD_X &&
          Math.abs(y - region.cy) < CARD_H / 2 + hh + PAD_Y
        ) {
          return false;
        }
      }
      return true;
    };
    // pinned cards are fixed anchors; new cards pack into the gaps between them (and each other).
    const placed: Placed[] = claims.filter((c) => isPinned(c.id));
    for (const c of claims) {
      if (isPinned(c.id)) continue;
      const home = regionByName.get(c.region) ?? regions[0];
      for (let k = 0; k < 4000; k += 1) {
        const r = 20 + 22 * Math.sqrt(k);
        const a = k * GOLDEN;
        const x = home.cx + Math.cos(a) * r;
        const y = home.cy + Math.sin(a) * r * 0.92;
        if (fits(x, y, placed)) {
          c.x = x;
          c.y = y;
          break;
        }
      }
      placed.push(c);
    }
  }

  // First settle the cards, then anchor each label above its (now-separated) cluster, then settle
  // again so cards displaced by a label re-settle without overlapping anything. A region carried over
  // from the seed keeps its label exactly where it was (re-anchoring it could land it on a pinned card
  // we can no longer move); only brand-new regions get anchored.
  separate();
  for (const region of regions) {
    if (seed?.regions.has(region.name)) continue;
    const members = claims.filter((c) => c.region === region.name);
    if (members.length === 0) continue;
    let minY = Infinity;
    let sumX = 0;
    for (const c of members) {
      if (c.y < minY) minY = c.y;
      sumX += c.x;
    }
    region.cx = Math.min(WW - 80, Math.max(80, sumX / members.length));
    region.cy = Math.max(28, minY - LABEL_GAP);
  }
  separate();

  // Structural backbone: link each region's claims into a nearest-neighbour chain (so a cluster reads
  // as connected), then link consecutive regions through their first claim — the whole map becomes one
  // visible structure even with zero contradiction threads. Deterministic, derived purely from
  // positions. These are faint lines, NOT the coloured relation threads.
  const links: Link[] = [];
  const firstOfRegion: Placed[] = [];
  for (const region of regions) {
    const members = claims.filter((c) => c.region === region.name);
    if (members.length === 0) continue;
    firstOfRegion.push(members[0]);
    // greedy nearest-neighbour chain through the cluster
    const remaining = members.slice(1);
    let current = members[0];
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let k = 0; k < remaining.length; k += 1) {
        const d = (remaining[k].x - current.x) ** 2 + (remaining[k].y - current.y) ** 2;
        if (d < bestD) {
          bestD = d;
          bestIdx = k;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      links.push({ a: current.id, b: next.id });
      current = next;
    }
  }
  // region-to-region backbone
  for (let i = 1; i < firstOfRegion.length; i += 1) {
    links.push({ a: firstOfRegion[i - 1].id, b: firstOfRegion[i].id });
  }

  return { regions, claims, links, width: WW, height: WH };
}

/** Build a {@link LayoutSeed} from a prior layout so the next `layout()` pins everything already
 *  placed and only settles the new cards around them. */
export function seedFrom(prev: LayoutResult): LayoutSeed {
  return {
    claims: new Map(prev.claims.map((c) => [c.id, { x: c.x, y: c.y }])),
    regions: new Map(prev.regions.map((r) => [r.name, { cx: r.cx, cy: r.cy }])),
    width: prev.width,
    height: prev.height,
  };
}
