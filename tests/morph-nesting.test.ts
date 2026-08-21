// Folding a breakdown is chain-gated and order-independent. Both of those were once true only by
// accident: the flow layout folded children in whatever order `world.nodes` happened to arrive in,
// and it did so BEFORE the held-aside band existed, so a part whose cause was shelved landed at the
// layout's origin instead of on its cause.
import { describe, expect, it } from 'vitest';
import { layoutFlow } from '../src/canvas/spatial/morph/layouts/flowLayout';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import { layoutTimeline } from '../src/canvas/spatial/morph/layouts/timelineLayout';
import { unfoldedIds } from '../src/canvas/spatial/morph/layouts/nesting';
import type { WorldData } from '../src/canvas/spatial/morph/types';

/** A cause with a part, that part with a part of its own, plus a weighted pair so flow has ribbons
 *  and an unweighted cause so it also has a shelf. */
const nested = (): WorldData => ({
  outcomeId: 'out',
  nodes: [
    { id: 'a', label: 'A', role: 'root', depth: 0 },
    { id: 'a.1', label: 'A part', parentId: 'a' },
    { id: 'a.1.i', label: 'A part of a part', parentId: 'a.1' },
    { id: 'lonely', label: 'No measured share', role: 'root', depth: 0 },
    { id: 'lonely.1', label: 'Part of the shelved one', parentId: 'lonely' },
    { id: 'out', label: 'Outcome', role: 'outcome', depth: 1 },
  ],
  edges: [{ id: 'e', from: 'a', to: 'out', sign: 1, weight: 0.6 }],
});

describe('unfoldedIds', () => {
  it('opens a part only when its WHOLE ancestor chain is open', () => {
    const w = nested();
    expect(unfoldedIds(w, new Set()).open.has('a.1')).toBe(false);
    expect(unfoldedIds(w, new Set(['a'])).open.has('a.1')).toBe(true);
    // The grandchild needs both levels — opening the top one alone is not enough.
    expect(unfoldedIds(w, new Set(['a'])).open.has('a.1.i')).toBe(false);
    expect(unfoldedIds(w, new Set(['a', 'a.1'])).open.has('a.1.i')).toBe(true);
  });

  it('treats a parent cycle as folded rather than looping forever', () => {
    const w: WorldData = {
      nodes: [
        { id: 'x', label: 'X', parentId: 'y' },
        { id: 'y', label: 'Y', parentId: 'x' },
      ],
      edges: [],
    };
    const { open } = unfoldedIds(w, new Set(['x', 'y']));
    expect(open.has('x')).toBe(false);
    expect(open.has('y')).toBe(false);
  });
});

describe('folding does not depend on the order nodes arrive in', () => {
  // Not a claim that the whole layout is shuffle-invariant — the held-aside band and the columns lay
  // nodes out in list order, and the adapter's order is stable for a given spec. The invariant is
  // narrower and was genuinely broken: a fold reads its parent's POSITION, so it only worked while
  // parents happened to be visited first. Listing children before their parents proves it no longer
  // depends on that.
  const childrenFirst = (w: WorldData): WorldData => ({ ...w, nodes: [...w.nodes].reverse() });

  it.each([
    ['flow', layoutFlow],
    ['graph', layoutGraph],
    ['timeline', layoutTimeline],
  ])('%s folds onto the parent even with children listed first', (_name, fn) => {
    const layout = fn(childrenFirst(nested()));
    for (const [child, parent] of [
      ['a.1', 'a'],
      ['a.1.i', 'a.1'],
      ['lonely.1', 'lonely'],
    ] as const) {
      const c = layout.positions.get(child)!;
      const p = layout.positions.get(parent)!;
      expect(c.folded, child).toBe(true);
      expect({ x: c.x, y: c.y }, child).toEqual({ x: p.x, y: p.y });
    }
  });
});

describe('a part of a held-aside cause folds onto that cause', () => {
  it('lands on its parent, not at the layout origin', () => {
    // `lonely` carries no measured share, so flow shelves it — and its part must follow it there.
    const layout = layoutFlow(nested());
    const parent = layout.positions.get('lonely')!;
    const child = layout.positions.get('lonely.1')!;
    expect(parent.shelved).toBe(true);
    expect(child.folded).toBe(true);
    expect({ x: child.x, y: child.y }).toEqual({ x: parent.x, y: parent.y });
  });

  it('folds a part of a part onto the part, at every depth', () => {
    const layout = layoutFlow(nested());
    const mid = layout.positions.get('a.1')!;
    const deep = layout.positions.get('a.1.i')!;
    expect(deep.folded).toBe(true);
    expect({ x: deep.x, y: deep.y }).toEqual({ x: mid.x, y: mid.y });
  });
});
