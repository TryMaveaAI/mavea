// morph-graph-reading-order.test.ts — the causal graph reads left to right, and a link never
// contradicts that.
//
// Columns by depth are the whole premise of the representation: the reader follows an arrow from
// a cause to what it explains, and the arrow points rightwards (or, inside one column, downwards).
// A spec can name columns its own edges contradict — a mechanism at depth 2 causing something the
// same spec placed at depth 1, or a node called a root that other causes point INTO — and taken
// literally that drew the cause to the RIGHT of its effect, on the same row, with the link
// doubling back across both cards. Model output gets depth wrong the same way a hand-authored
// fixture does, so the layout repairs it rather than trusting it.
//
// What is pinned here is the invariant, never a geometry number: within one reading band, the card
// a link ENDS on never starts left of the card it LEAVES. Links that wrap to the next band are
// excluded — that turn is the layout's own line break, and it goes leftwards by design.
import { describe, expect, it } from 'vitest';
import { worldToMorph } from '../src/canvas/spatial/morph/adapters';
import { layoutGraph } from '../src/canvas/spatial/morph/layouts/graphLayout';
import type { MorphLayout, WorldData } from '../src/canvas/spatial/morph/types';
import { ALL_WORLD_SCENARIOS } from '../src/live/world/scenarios/index';

/** The stage the surface actually fits a world into (world-gauntlet's own frame). */
const LAYOUT_HINT = { w: 1200 - 112, h: 760 - 112 };

/** Every link drawn inside a single reading band that runs from a card to one standing further
 *  LEFT. A wrapped link is skipped: crossing back to the start of the next band is the composition
 *  breaking a line, not a cause landing after its effect. */
function backwardsLinks(world: WorldData, layout: MorphLayout): string[] {
  const paths = new Map(layout.edgePaths.map((p) => [p.id, p]));
  const out: string[] = [];
  for (const e of world.edges) {
    const from = layout.positions.get(e.from);
    const to = layout.positions.get(e.to);
    const path = paths.get(e.id);
    if (!from || !to || !path || path.className.includes('morph-edge--wrap')) continue;
    if (to.x < from.x) {
      out.push(`${e.from}(x=${Math.round(from.x)}) → ${e.to}(x=${Math.round(to.x)})`);
    }
  }
  return out;
}

/** True when the world's top-level web contains a ring. A ring has no reading order to preserve —
 *  some link in it must point backwards — and the coercer cuts one before a world reaches the
 *  surface (world-acyclic.test.ts), so the invariant below is asserted on the acyclic corpus. */
function hasCycle(world: WorldData): boolean {
  const ids = new Set(world.nodes.filter((n) => n.parentId === undefined).map((n) => n.id));
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const out = new Map<string, string[]>();
  for (const e of world.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    indegree.set(e.to, indegree.get(e.to)! + 1);
    const list = out.get(e.from);
    if (list === undefined) out.set(e.from, [e.to]);
    else list.push(e.to);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0);
  for (let head = 0; head < queue.length; head++) {
    for (const to of out.get(queue[head]) ?? []) {
      const left = indegree.get(to)! - 1;
      indegree.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  return queue.length < ids.size;
}

const columnOf = (layout: MorphLayout, id: string): number => layout.positions.get(id)!.x;
const rowOf = (layout: MorphLayout, id: string): number => layout.positions.get(id)!.y;

describe('Causal graph — a cause is never drawn to the right of its effect', () => {
  it('holds across the whole scenario corpus, folded and with every breakdown open', () => {
    const violations: string[] = [];
    for (const scenario of ALL_WORLD_SCENARIOS) {
      const world = worldToMorph(scenario.spec);
      if (hasCycle(world)) continue;
      const parents = new Set(
        world.nodes.map((n) => n.parentId).filter((id): id is string => id !== undefined),
      );
      const modes = parents.size > 0 ? (['folded', 'expanded'] as const) : (['folded'] as const);
      for (const mode of modes) {
        const layout = layoutGraph(world, {
          viewport: LAYOUT_HINT,
          ...(mode === 'expanded' ? { expandedIds: parents } : {}),
        });
        for (const link of backwardsLinks(world, layout)) {
          violations.push(`${scenario.id}/${mode}: ${link}`);
        }
      }
    }
    expect(
      violations,
      `${violations.length} backwards link(s):\n  ${violations.join('\n  ')}`,
    ).toEqual([]);
  });

  it('pulls an effect the spec placed LEFT of its own cause back into line', () => {
    // The shape tech-treaty-collapse ships: a mechanism at depth 2 causing a node the same spec
    // called depth 1. Honoured literally, the cause stood a whole column to the right.
    const world: WorldData = {
      outcomeId: 'end',
      nodes: [
        { id: 'root', label: 'Root', role: 'root', depth: 0 },
        { id: 'effect', label: 'Effect', role: 'mechanism', depth: 1 },
        { id: 'cause', label: 'Cause', role: 'mechanism', depth: 2 },
        { id: 'end', label: 'Outcome', role: 'outcome', depth: 3 },
      ],
      edges: [
        { id: 'e1', from: 'root', to: 'cause' },
        { id: 'e2', from: 'cause', to: 'effect' },
        { id: 'e3', from: 'effect', to: 'end' },
      ],
    };
    const layout = layoutGraph(world, { viewport: LAYOUT_HINT });
    expect(backwardsLinks(world, layout)).toEqual([]);
    expect(columnOf(layout, 'effect')).toBeGreaterThanOrEqual(columnOf(layout, 'cause'));
    expect(columnOf(layout, 'end')).toBeGreaterThan(columnOf(layout, 'effect'));
  });

  it('does the same for a "root" other causes point into', () => {
    // tech-retail-decline's shape: `revenue` is authored a root at depth 0, and two depth-1
    // mechanisms cause it.
    const world: WorldData = {
      outcomeId: 'end',
      nodes: [
        { id: 'revenue', label: 'Revenue', role: 'root', depth: 0 },
        { id: 'delivery', label: 'Delivery', role: 'mechanism', depth: 1 },
        { id: 'range', label: 'Range', role: 'mechanism', depth: 1 },
        { id: 'end', label: 'Outcome', role: 'outcome', depth: 3 },
      ],
      edges: [
        { id: 'e1', from: 'delivery', to: 'revenue' },
        { id: 'e2', from: 'range', to: 'revenue' },
        { id: 'e3', from: 'revenue', to: 'end' },
      ],
    };
    const layout = layoutGraph(world, { viewport: LAYOUT_HINT });
    expect(backwardsLinks(world, layout)).toEqual([]);
    expect(columnOf(layout, 'revenue')).toBeGreaterThanOrEqual(columnOf(layout, 'delivery'));
  });

  it('keeps a same-depth pair in ONE column, linked top to bottom', () => {
    // The repair pulls an effect no further than its cause's own column, because a shared depth is
    // how the layout draws a step it was told is not a step across: WORLD_SEED chains four such
    // pairs, and pushing each of them a column right turns a composition that fits into a ribbon.
    const world: WorldData = {
      outcomeId: 'end',
      nodes: [
        { id: 'root', label: 'Root', role: 'root', depth: 0 },
        { id: 'first', label: 'First', role: 'mechanism', depth: 1 },
        { id: 'second', label: 'Second', role: 'mechanism', depth: 1 },
        { id: 'end', label: 'Outcome', role: 'outcome', depth: 2 },
      ],
      edges: [
        { id: 'e1', from: 'root', to: 'first' },
        { id: 'e2', from: 'first', to: 'second' },
        { id: 'e3', from: 'second', to: 'end' },
      ],
    };
    const layout = layoutGraph(world, { viewport: LAYOUT_HINT });
    expect(backwardsLinks(world, layout)).toEqual([]);
    expect(columnOf(layout, 'second')).toBe(columnOf(layout, 'first'));
    // …and the cause reads above the effect, which is the direction the vertical link is drawn in.
    expect(rowOf(layout, 'second')).toBeGreaterThan(rowOf(layout, 'first'));
  });

  it('orders a same-depth link left to right when the depth splits into columns', () => {
    // natural-wildfire-run's shape: eight roots at one depth, three of them causing a fourth. The
    // depth is taller than a reading band, so it stands in several columns — and the effect has to
    // take a column at or after every cause's, whatever the barycenter would have preferred.
    // `moisture` is authored SECOND, as its counterpart is, so barycenter order alone would seat
    // it in the first column with all three of its causes to the right of it.
    const causes = ['beta', 'gamma', 'delta'];
    const rest = ['epsilon', 'zeta', 'eta'];
    const world: WorldData = {
      outcomeId: 'end',
      nodes: [
        { id: 'alpha', label: 'alpha', role: 'root' as const, depth: 0 },
        { id: 'moisture', label: 'Moisture', role: 'root' as const, depth: 0 },
        ...[...causes, ...rest].map((id) => ({ id, label: id, role: 'root' as const, depth: 0 })),
        { id: 'end', label: 'Outcome', role: 'outcome' as const, depth: 1 },
      ],
      edges: [
        ...causes.map((id, i) => ({ id: `e${i}`, from: id, to: 'moisture' })),
        { id: 'out', from: 'moisture', to: 'end' },
      ],
    };
    // A short stage, so the eight-card depth cannot stand in one column.
    const layout = layoutGraph(world, { viewport: { w: 1088, h: 360 } });
    const columns = new Set(
      ['alpha', 'moisture', ...causes, ...rest].map((id) => columnOf(layout, id)),
    );
    expect(
      columns.size,
      'the depth has to actually split for this to test anything',
    ).toBeGreaterThan(1);
    expect(backwardsLinks(world, layout)).toEqual([]);
    for (const id of causes) {
      expect(columnOf(layout, 'moisture'), id).toBeGreaterThanOrEqual(columnOf(layout, id));
    }
  });
});
