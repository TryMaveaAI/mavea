// separate.ts — pairwise AABB separation for mixed-size rects: the keepout-free core of the
// mind-shape relaxation. Overlapping pairs push apart along the axis of least overlap, half the
// distance each, until nothing moves or the iteration budget runs out. Mutates in place and is
// fully deterministic — coincident rects split along their index order, never randomly.
//
// The pairs come from a uniform spatial hash rather than an every-pair sweep, so with bounded card
// sizes and bounded local density a relaxation over n cards costs O(n) per iteration instead of
// O(n²) — the difference between a laggy web and an instant one once a world runs to hundreds of
// nodes. Space is O(n).

export interface SeparableRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_ITERATIONS = 200;

export function separateRects(rects: SeparableRect[], gap = 24): void {
  const n = rects.length;
  if (n < 2) return;

  // Two rects can only overlap when their centres are within max(w, h) + gap on BOTH axes, so a
  // cell of exactly that size puts every possible partner in a rect's own cell or one of the eight
  // around it: the broad phase is exact for the positions the grid was built from, not a heuristic.
  // That exactness is what keeps the early exit honest — an iteration that pushes nothing has seen
  // every pair that could have touched, so there is genuinely no overlap left anywhere.
  let cell = 0;
  for (const r of rects) cell = Math.max(cell, r.w, r.h);
  cell = Math.max(cell + gap, 1); // a degenerate all-zero set still needs a finite cell

  const cellOf = new Array<number>(n);
  const index = new Map<number, Map<number, number>>();

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Rebuilt every iteration: the rects have moved, and the grid has to describe where they are
    // now. It is one linear pass, so this costs the same order as the sweep it feeds.
    index.clear();
    const cellX: number[] = [];
    const cellY: number[] = [];
    const members: number[][] = [];
    for (let i = 0; i < n; i++) {
      const r = rects[i];
      const cx = Math.floor((r.x + r.w / 2) / cell);
      const cy = Math.floor((r.y + r.h / 2) / cell);
      let column = index.get(cx);
      if (column === undefined) {
        column = new Map();
        index.set(cx, column);
      }
      let id = column.get(cy);
      if (id === undefined) {
        id = members.length;
        column.set(cy, id);
        cellX.push(cx);
        cellY.push(cy);
        members.push([]);
      }
      members[id].push(i); // filled in index order, so every bucket stays sorted
      cellOf[i] = id;
    }

    // One candidate list per occupied cell — every rect in a cell shares the same 3×3
    // neighbourhood, so merging it once and walking it with a cursor is what keeps the sweep
    // linear; building it per rect would pay the merge n times over.
    const near: number[][] = members.map((_, id) => {
      const list: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        const column = index.get(cellX[id] + dx);
        if (column === undefined) continue;
        for (let dy = -1; dy <= 1; dy++) {
          const neighbour = column.get(cellY[id] + dy);
          if (neighbour === undefined) continue;
          for (const i of members[neighbour]) list.push(i);
        }
      }
      return list.sort((p, q) => p - q);
    });
    const cursor = new Array<number>(members.length).fill(0);

    let moved = false;
    for (let a = 0; a < n; a++) {
      const id = cellOf[a];
      const list = near[id];
      // `a` climbs, and so does every rect that shares its cell, so this cursor only ever moves
      // forward. What is left of the list is the b > a an every-pair sweep would reach in this
      // neighbourhood, in the same order, so the in-place pushes compose identically and land on
      // the same numbers — exactly, for any set whose per-pass motion keeps a rect inside its own
      // cell, which is every world this stage lays out. Blow a few thousand mutually-overlapping
      // cards apart at once and a rect can cross a cell mid-pass, meeting a partner the pass had
      // already indexed elsewhere; the next pass re-indexes and catches it, so the run settles on
      // an equally valid arrangement rather than the identical one.
      let k = cursor[id];
      while (k < list.length && list[k] <= a) k++;
      cursor[id] = k;
      const left = rects[a];
      for (; k < list.length; k++) {
        const b = list[k];
        const right = rects[b];
        let dx = right.x + right.w / 2 - (left.x + left.w / 2);
        let dy = right.y + right.h / 2 - (left.y + left.h / 2);
        if (dx === 0 && dy === 0) {
          // Coincident centres have no push direction — give them one from their index order.
          dx = a - b;
          dy = b - a;
        }
        const overlapX = (left.w + right.w) / 2 + gap - Math.abs(dx);
        const overlapY = (left.h + right.h) / 2 + gap - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        moved = true;
        if (overlapX <= overlapY) {
          const push = (overlapX / 2) * (dx < 0 ? -1 : 1);
          left.x -= push;
          right.x += push;
        } else {
          const push = (overlapY / 2) * (dy < 0 ? -1 : 1);
          left.y -= push;
          right.y += push;
        }
      }
    }
    if (!moved) break;
  }
}
