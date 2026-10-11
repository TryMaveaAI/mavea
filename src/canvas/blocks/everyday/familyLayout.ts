import type { FamilyPerson } from './types';

/** Everyone who shares an exact parent set (one or two ids) — the unit a sibship bar hangs
 *  from. */
export interface ParentGroup {
  parentIds: string[]; // length 1 or 2
  childIds: string[];
}

export interface FamilyLayout {
  /** Generation row per person id (0 = the top row). */
  gen: Map<string, number>;
  /** Horizontal position per person id, in column units (1 = one unrelated person's width). */
  slot: Map<string, number>;
  /** Each row's people, left to right. */
  rows: string[][];
  groups: ParentGroup[];
  partnerOf: Map<string, string>;
  maxGen: number;
}

/** Resolve each person's generation row: a child sits one row below its deepest-placed
 *  parent, and any partnership — explicit (`partner`) or implicit (co-parenting a child
 *  together) — is pinned to the same row so its mating line is always horizontal. Iterates
 *  to a fixed point so listing order never matters. */
function resolveGenerations(
  people: FamilyPerson[],
  byId: Map<string, FamilyPerson>,
): Map<string, number> {
  const gen = new Map<string, number>();
  for (const p of people) gen.set(p.id, 0);

  for (let pass = 0; pass < people.length + 1; pass++) {
    let changed = false;
    for (const p of people) {
      if (!p.parents) continue;
      const parentGens = p.parents.map((pid) => gen.get(pid)).filter((g): g is number => g != null);
      if (parentGens.length === 0) continue;
      const want = Math.max(...parentGens) + 1;
      if (want > (gen.get(p.id) ?? 0)) {
        gen.set(p.id, want);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const p of people) {
    if (p.partner && byId.has(p.partner)) {
      const row = Math.max(gen.get(p.id) ?? 0, gen.get(p.partner) ?? 0);
      gen.set(p.id, row);
      gen.set(p.partner, row);
    }
  }
  for (const p of people) {
    if (p.parents?.length === 2 && byId.has(p.parents[0]) && byId.has(p.parents[1])) {
      const [a, b] = p.parents;
      const row = Math.max(gen.get(a) ?? 0, gen.get(b) ?? 0);
      gen.set(a, row);
      gen.set(b, row);
    }
  }
  return gen;
}

function parentIdsOf(p: FamilyPerson, byId: Map<string, FamilyPerson>): string[] {
  return (p.parents ?? []).filter((id) => byId.has(id) && id !== p.id);
}

function findParentGroups(people: FamilyPerson[], byId: Map<string, FamilyPerson>): ParentGroup[] {
  const map = new Map<string, ParentGroup>();
  for (const p of people) {
    const ids = parentIdsOf(p, byId);
    if (ids.length === 0) continue;
    const key = [...ids].sort().join(' ');
    const g = map.get(key) ?? { parentIds: ids, childIds: [] };
    g.childIds.push(p.id);
    map.set(key, g);
  }
  return [...map.values()];
}

/**
 * Lay out a family tree so that no line has to cross a card.
 *
 * Two things make that hard, and both are about ORDER rather than spacing:
 *  - siblings must sit together (one bar hangs them all), and a sibling who married into
 *    another family must sit at the end of their sibling run that faces their partner — so
 *    the in-laws' run continues from the other side of the couple instead of interleaving;
 *  - each couple must stay adjacent in its own row, and the row above must follow the row
 *    below's order, or two sets of grandparents interleave and each mating line runs
 *    through the other couple's cards.
 *
 * Rows are ordered top-down (sibling runs chained through marriages, chains sorted by where
 * their parents sit), the top row is then re-sorted by where its children landed and the
 * order recomputed once, and finally positions are swept bottom-up: each parent unit asks to
 * sit centred over its children and is pushed right only as far as its left neighbour needs.
 * A unit that cannot sit over its children keeps their bar reaching its drop line instead.
 */
export function layoutFamily(people: FamilyPerson[], mateGap: number): FamilyLayout {
  const byId = new Map<string, FamilyPerson>();
  for (const p of people) byId.set(p.id, p);

  const gen = resolveGenerations(people, byId);
  const groups = findParentGroups(people, byId);

  const partnerOf = new Map<string, string>();
  for (const g of groups) {
    if (g.parentIds.length === 2) {
      partnerOf.set(g.parentIds[0], g.parentIds[1]);
      partnerOf.set(g.parentIds[1], g.parentIds[0]);
    }
  }
  for (const p of people) {
    if (p.partner && byId.has(p.partner) && !partnerOf.has(p.id) && !partnerOf.has(p.partner)) {
      partnerOf.set(p.id, p.partner);
      partnerOf.set(p.partner, p.id);
    }
  }
  const sameRowMate = (id: string): string | undefined => {
    const m = partnerOf.get(id);
    return m && gen.get(m) === gen.get(id) ? m : undefined;
  };

  const maxGen = people.reduce((m, p) => Math.max(m, gen.get(p.id) ?? 0), 0);
  const members: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const p of people) members[gen.get(p.id) ?? 0].push(p.id);

  const rows: string[][] = members.map(() => []);

  // The top row has no parents to follow, so it starts in listing order with couples kept
  // adjacent; it is re-sorted by its children once the rows below have an order.
  const pairUp = (ids: string[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      out.push(id);
      seen.add(id);
      const m = sameRowMate(id);
      if (m && !seen.has(m)) {
        out.push(m);
        seen.add(m);
      }
    }
    return out;
  };

  const orderBelow = (g: number) => {
    const above = new Map(rows[g - 1].map((id, i) => [id, i]));
    // Sibling runs: everyone sharing a parent set, plus singletons for people whose parents
    // are not in the data (typically someone who married in).
    const runKey = (id: string) => {
      const ids = parentIdsOf(byId.get(id)!, byId);
      return ids.length ? [...ids].sort().join(' ') : `self:${id}`;
    };
    const runs = new Map<string, string[]>();
    for (const id of members[g]) {
      const k = runKey(id);
      runs.set(k, [...(runs.get(k) ?? []), id]);
    }
    const anchor = (run: string[]) => {
      const ids = parentIdsOf(byId.get(run[0])!, byId).filter((pid) => above.has(pid));
      if (ids.length) return ids.reduce((s, pid) => s + above.get(pid)!, 0) / ids.length;
      // A married-in singleton follows its partner's run; anything else trails the row.
      const m = sameRowMate(run[0]);
      const mRun = m ? runs.get(runKey(m)) : undefined;
      if (mRun && mRun !== run) {
        const mIds = parentIdsOf(byId.get(mRun[0])!, byId).filter((pid) => above.has(pid));
        if (mIds.length) return mIds.reduce((s, pid) => s + above.get(pid)!, 0) / mIds.length;
      }
      return Number.POSITIVE_INFINITY;
    };
    const pending = [...runs.values()].sort((a, b) => anchor(a) - anchor(b));
    const used = new Set<string[]>();
    const out: string[] = [];
    for (const start of pending) {
      if (used.has(start)) continue;
      used.add(start);
      // A chain: runs joined end to start through a marriage between them.
      let run = start;
      let enterVia: string | undefined;
      for (;;) {
        const rest = run.filter((id) => id !== enterVia);
        let exit: string | undefined;
        let next: string[] | undefined;
        for (const id of rest) {
          const m = sameRowMate(id);
          const mRun = m ? runs.get(runKey(m)) : undefined;
          if (m && mRun && !used.has(mRun)) {
            exit = id;
            next = mRun;
            break;
          }
        }
        const middle = rest.filter((id) => id !== exit);
        if (enterVia) out.push(enterVia);
        out.push(...middle);
        if (!exit || !next) break;
        out.push(exit);
        used.add(next);
        enterVia = sameRowMate(exit);
        run = next;
      }
    }
    rows[g] = pairUp(out);
  };

  rows[0] = pairUp(members[0]);
  for (let g = 1; g <= maxGen; g++) orderBelow(g);
  if (maxGen >= 1) {
    const below = new Map(rows[1].map((id, i) => [id, i]));
    const units = toUnits(rows[0], sameRowMate);
    const centre = (u: string[], fallback: number) => {
      const kids = groups
        .filter((grp) => grp.parentIds.some((pid) => u.includes(pid)))
        .flatMap((grp) => grp.childIds)
        .filter((cid) => below.has(cid));
      return kids.length ? kids.reduce((s, c) => s + below.get(c)!, 0) / kids.length : fallback;
    };
    const keyed = units.map((u, i) => ({ u, k: centre(u, i - 0.5) }));
    keyed.sort((a, b) => a.k - b.k);
    rows[0] = keyed.flatMap((x) => x.u);
    for (let g = 1; g <= maxGen; g++) orderBelow(g);
  }

  // Positions. Start every row packed from zero, then sweep bottom-up.
  const mateStep = mateGap;
  const slot = new Map<string, number>();
  const pack = (row: string[], want: (u: string[]) => number) => {
    let right = Number.NEGATIVE_INFINITY;
    for (const u of toUnits(row, sameRowMate)) {
      const width = u.length === 2 ? mateStep : 0;
      const left = Math.max(want(u) - width / 2, right + 1);
      slot.set(u[0], left);
      if (u.length === 2) slot.set(u[1], left + mateStep);
      right = left + width;
    }
  };
  for (const row of rows) pack(row, () => 0);

  for (let g = maxGen; g >= 1; g--) {
    const wanted = new Map<string, number>();
    for (const grp of groups) {
      const kids = grp.childIds.filter((cid) => gen.get(cid) === g);
      if (kids.length === 0) continue;
      const xs = kids.map((cid) => slot.get(cid) ?? 0);
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      for (const pid of grp.parentIds) if (gen.get(pid) === g - 1) wanted.set(pid, mid);
    }
    pack(rows[g - 1], (u) => {
      const ws = u.map((id) => wanted.get(id)).filter((w): w is number => w != null);
      if (ws.length) return ws.reduce((s, w) => s + w, 0) / ws.length;
      // Childless: stay where the packing put it, as a centre.
      const xs = u.map((id) => slot.get(id) ?? 0);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    });
  }

  // The bottom-up sweep can only push parents right, so a family whose parents were shoved
  // aside by a neighbour ends up hanging off to one side. One top-down pass slides each sibling
  // run back under its parents' drop where the row has the room, still never reordering.
  for (let g = 1; g <= maxGen; g++) {
    const shift = new Map<string, number>();
    for (const grp of groups) {
      const parents = grp.parentIds.filter((pid) => gen.get(pid) === g - 1);
      const kids = grp.childIds.filter((cid) => gen.get(cid) === g);
      if (parents.length === 0 || kids.length === 0) continue;
      const ps = parents.map((pid) => slot.get(pid) ?? 0);
      const ks = kids.map((cid) => slot.get(cid) ?? 0);
      const drop = (Math.min(...ps) + Math.max(...ps)) / 2;
      const delta = drop - (Math.min(...ks) + Math.max(...ks)) / 2;
      for (const cid of kids) shift.set(cid, delta);
    }
    const centreOf = (u: string[]) => {
      const xs = u.map((id) => slot.get(id) ?? 0);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    pack(rows[g], (u) => {
      // A couple joining two families is held by both sets of parents, so it stays put;
      // only a unit with one family above it follows that family.
      const ds = u.map((id) => shift.get(id)).filter((d): d is number => d != null);
      return centreOf(u) + (ds.length === 1 ? ds[0] : 0);
    });
  }

  return { gen, slot, rows, groups, partnerOf, maxGen };
}

/** Split an ordered row into placement units: a couple sitting side by side, or one person. */
function toUnits(row: string[], mateOf: (id: string) => string | undefined): string[][] {
  const units: string[][] = [];
  for (let i = 0; i < row.length; i++) {
    if (i + 1 < row.length && mateOf(row[i]) === row[i + 1]) {
      units.push([row[i], row[i + 1]]);
      i++;
    } else {
      units.push([row[i]]);
    }
  }
  return units;
}
