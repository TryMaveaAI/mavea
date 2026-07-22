// levers/dag.ts — the pure dependency executor. Given input overrides, it resolves every node's value
// in dependency order: an input takes its override (or printed value), a derived node evaluates its
// formula over already-resolved deps. A cycle, a missing dep, or a bad formula leaves a node UNRESOLVED
// (never a wrong number). Runs free on every slider drag — no model, no network. Pure + deterministic.
import { evalExpr } from './expr';
import type { LeverBound, LeverNode } from './types';

export interface EvalResult {
  /** Resolved node id → value. */
  values: Map<string, number>;
  /** Nodes that could not be computed (cycle, missing dep, malformed/zero-division formula). */
  unresolved: Set<string>;
}

/**
 * Evaluate all nodes under the given input overrides. Memoized, cycle-safe recursion: each node is
 * resolved once; a node currently being resolved that's reached again is a cycle and becomes unresolved.
 */
export function evaluate(
  nodes: readonly LeverNode[],
  overrides: ReadonlyMap<string, number>,
): EvalResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const values = new Map<string, number>();
  const unresolved = new Set<string>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    if (values.has(id)) return values.get(id)!;
    if (unresolved.has(id)) return NaN;
    const node = byId.get(id);
    if (!node || visiting.has(id)) {
      unresolved.add(id); // unknown id or a cycle
      return NaN;
    }
    if (!node.formula) {
      const v = overrides.has(id) ? overrides.get(id)! : node.printed;
      if (Number.isFinite(v)) {
        values.set(id, v);
        return v;
      }
      unresolved.add(id);
      return NaN;
    }
    visiting.add(id);
    const env: Record<string, number> = {};
    for (const dep of node.deps) {
      const dv = resolve(dep);
      if (Number.isFinite(dv)) env[dep] = dv;
    }
    visiting.delete(id);
    const v = evalExpr(node.formula, env);
    if (Number.isFinite(v)) {
      values.set(id, v);
      return v;
    }
    unresolved.add(id);
    return NaN;
  };

  for (const n of nodes) resolve(n.id);
  return { values, unresolved };
}

/** Whether a value satisfies a stated bound (a violated bound is what flips a conclusion red). */
export function boundSatisfied(bound: LeverBound, value: number): boolean {
  switch (bound.op) {
    case 'gt':
      return value > bound.value;
    case 'gte':
      return value >= bound.value;
    case 'lt':
      return value < bound.value;
    case 'lte':
      return value <= bound.value;
  }
}
